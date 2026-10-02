package app.youngtube.app;

import android.os.Environment;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.exceptions.ExtractionException;
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeStreamLinkHandlerFactory;
import org.schabi.newpipe.extractor.stream.StreamExtractor;
import org.schabi.newpipe.extractor.stream.StreamInfo;
import org.schabi.newpipe.extractor.stream.VideoStream;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

@CapacitorPlugin(name = "YoungTubeDownloader")
public class YoungTubeDownloaderPlugin extends Plugin {

    private static final String TAG = "YoungTubeDownloader";
    private static volatile boolean isNewPipeInitialized = false;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private OkHttpClient fileHttpClient;

    @Override
    public void load() {
        super.load();
        initNewPipe();
        fileHttpClient = new OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .build();
    }

    private synchronized void initNewPipe() {
        if (!isNewPipeInitialized) {
            try {
                NewPipe.init(OkHttpDownloader.createDefault());
                isNewPipeInitialized = true;
                Log.i(TAG, "NewPipe Extractor initialized successfully.");
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize NewPipe Extractor", e);
            }
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        String videoId = call.getString("videoId");
        String title = call.getString("title");

        if (videoId == null || videoId.trim().isEmpty()) {
            JSObject res = new JSObject();
            res.put("ok", false);
            res.put("code", "INVALID");
            res.put("message", "معرف الفيديو غير صالح (Video ID is invalid)");
            call.resolve(res);
            return;
        }

        final String cleanVideoId = videoId.trim();
        final String cleanTitle = (title != null && !title.trim().isEmpty()) ? title.trim() : cleanVideoId;

        // Run extraction and download asynchronously off the main thread to prevent ANR
        executor.execute(() -> {
            try {
                initNewPipe();

                // Resilience note: Extractor breaks when YouTube changes internal structures;
                // treat this download feature as experimental. The NewPipeExtractor dependency
                // must be updated whenever extraction fails widely across YouTube videos.
                String watchUrl = "https://www.youtube.com/watch?v=" + cleanVideoId;

                StreamExtractor extractor = ServiceList.YouTube.getStreamExtractor(watchUrl);
                extractor.fetchPage();

                // 1. Choose progressive stream (muxed video+audio) to allow simple single-file offline save
                // Cap resolution at 720p to keep file sizes appropriate for kids offline viewing
                List<VideoStream> videoStreams = extractor.getVideoStreams();
                if (videoStreams == null || videoStreams.isEmpty()) {
                    JSObject res = new JSObject();
                    res.put("ok", false);
                    res.put("code", "NATIVE_ERROR");
                    res.put("message", "لم يتم العثور على صيغة فيديو قابلة للتحميل المباشر لهذا المحتوى");
                    call.resolve(res);
                    return;
                }

                VideoStream selectedStream = null;
                for (VideoStream stream : videoStreams) {
                    if (selectedStream == null) {
                        selectedStream = stream;
                        continue;
                    }
                    String resStr = stream.getResolution();
                    // Prioritize 720p or 480p or 360p
                    if ("720p".equalsIgnoreCase(resStr)) {
                        selectedStream = stream;
                        break;
                    } else if ("480p".equalsIgnoreCase(resStr) && !"720p".equalsIgnoreCase(selectedStream.getResolution())) {
                        selectedStream = stream;
                    } else if ("360p".equalsIgnoreCase(resStr) && selectedStream == null) {
                        selectedStream = stream;
                    }
                }

                if (selectedStream == null || selectedStream.getUrl() == null || selectedStream.getUrl().isEmpty()) {
                    JSObject res = new JSObject();
                    res.put("ok", false);
                    res.put("code", "NATIVE_ERROR");
                    res.put("message", "تعذر استخراج رابط التدفق المباشر للفيديو");
                    call.resolve(res);
                    return;
                }

                String streamUrl = selectedStream.getUrl();

                // 2. Prepare app-specific destination directory (no broad storage permissions required)
                File moviesDir = getContext().getExternalFilesDir(Environment.DIRECTORY_MOVIES);
                if (moviesDir == null) {
                    moviesDir = new File(getContext().getFilesDir(), "movies");
                }
                if (!moviesDir.exists()) {
                    moviesDir.mkdirs();
                }

                // Sanitize filename
                String safeName = cleanTitle.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
                if (safeName.length() > 50) {
                    safeName = safeName.substring(0, 50).trim();
                }
                if (safeName.isEmpty()) {
                    safeName = cleanVideoId;
                }
                String formatExt = selectedStream.getFormat() != null ? selectedStream.getFormat().getSuffix() : "mp4";
                if (formatExt == null || formatExt.isEmpty()) {
                    formatExt = "mp4";
                }

                File destinationFile = new File(moviesDir, safeName + "_" + cleanVideoId + "." + formatExt);

                // 3. Download the stream to disk
                Request downloadRequest = new Request.Builder()
                        .url(streamUrl)
                        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
                        .build();

                try (Response response = fileHttpClient.newCall(downloadRequest).execute()) {
                    if (!response.isSuccessful()) {
                        JSObject res = new JSObject();
                        res.put("ok", false);
                        res.put("code", "NATIVE_ERROR");
                        res.put("message", "فشل اتصال خادم التنزيل (HTTP " + response.code() + ")");
                        call.resolve(res);
                        return;
                    }

                    ResponseBody body = response.body();
                    if (body == null) {
                        JSObject res = new JSObject();
                        res.put("ok", false);
                        res.put("code", "NATIVE_ERROR");
                        res.put("message", "استجابة التنزيل فارغة من المصدر");
                        call.resolve(res);
                        return;
                    }

                    try (InputStream in = body.byteStream();
                         FileOutputStream out = new FileOutputStream(destinationFile)) {
                        byte[] buffer = new byte[16 * 1024];
                        int bytesRead;
                        while ((bytesRead = in.read(buffer)) != -1) {
                            out.write(buffer, 0, bytesRead);
                        }
                        out.flush();
                    }
                }

                // 4. Return success structured result with file path
                JSObject res = new JSObject();
                res.put("ok", true);
                res.put("status", "done");
                res.put("path", destinationFile.getAbsolutePath());
                res.put("message", "تم التحميل بنجاح في ذاكرة التطبيق (تجريبي)");
                call.resolve(res);

            } catch (ExtractionException e) {
                Log.e(TAG, "NewPipe extraction failed for videoId: " + cleanVideoId, e);
                JSObject res = new JSObject();
                res.put("ok", false);
                res.put("code", "NATIVE_ERROR");
                res.put("message", "تعذر استخراج الفيديو من يوتيوب: " + (e.getMessage() != null ? e.getMessage() : "خطأ استخراج"));
                call.resolve(res);
            } catch (IOException e) {
                Log.e(TAG, "Network or disk error during video download", e);
                JSObject res = new JSObject();
                res.put("ok", false);
                res.put("code", "NATIVE_ERROR");
                res.put("message", "خطأ في الشبكة أو أثناء حفظ الملف محلياً: " + e.getMessage());
                call.resolve(res);
            } catch (Exception e) {
                Log.e(TAG, "Unexpected error in download plugin", e);
                JSObject res = new JSObject();
                res.put("ok", false);
                res.put("code", "NATIVE_ERROR");
                res.put("message", "خطأ غير متوقع: " + (e.getMessage() != null ? e.getMessage() : "غير معروف"));
                call.resolve(res);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        executor.shutdown();
    }
}
