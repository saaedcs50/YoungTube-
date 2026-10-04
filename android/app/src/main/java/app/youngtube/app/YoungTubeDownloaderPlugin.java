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
import org.schabi.newpipe.extractor.stream.StreamExtractor;
import org.schabi.newpipe.extractor.stream.VideoStream;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
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

    /**
     * Download quality locked to ~360p; not user-configurable.
     * Selects height == 360 if present, else best height < 360;
     * Never selects a stream with height > 360. Returns null if none available <= 360.
     */
    private VideoStream select360pStream(List<VideoStream> streams) {
        if (streams == null || streams.isEmpty()) {
            return null;
        }

        VideoStream exact360 = null;
        VideoStream bestUnder360 = null;
        int maxUnder360Height = -1;

        for (VideoStream stream : streams) {
            if (stream == null || stream.getUrl() == null || stream.getUrl().isEmpty()) {
                continue;
            }

            int height = -1;
            String resStr = stream.getResolution();
            if (resStr != null) {
                String digitsOnly = resStr.replaceAll("[^0-9]", "");
                if (!digitsOnly.isEmpty()) {
                    try {
                        height = Integer.parseInt(digitsOnly);
                    } catch (NumberFormatException ignored) {}
                }
            }

            // Fallback for known standard resolution labels if digits parsing was inconclusive
            if (height <= 0 && resStr != null) {
                if ("360p".equalsIgnoreCase(resStr)) height = 360;
                else if ("240p".equalsIgnoreCase(resStr)) height = 240;
                else if ("144p".equalsIgnoreCase(resStr)) height = 144;
                else if ("480p".equalsIgnoreCase(resStr)) height = 480;
                else if ("720p".equalsIgnoreCase(resStr)) height = 720;
                else if ("1080p".equalsIgnoreCase(resStr)) height = 1080;
            }

            if (height <= 0 || height > 360) {
                continue;
            }

            if (height == 360) {
                exact360 = stream;
                break; // ideal match found
            } else if (height < 360) {
                if (height > maxUnder360Height) {
                    maxUnder360Height = height;
                    bestUnder360 = stream;
                }
            }
        }

        if (exact360 != null) return exact360;
        if (bestUnder360 != null) return bestUnder360;
        return null;
    }

    private void emitProgress(String videoId, long bytesDownloaded, Long totalBytes, Integer percent) {
        JSObject data = new JSObject();
        data.put("videoId", videoId);
        data.put("bytesDownloaded", bytesDownloaded);
        if (totalBytes != null && totalBytes > 0) {
            data.put("totalBytes", totalBytes);
        } else {
            data.put("totalBytes", (Object) null);
        }
        if (percent != null) {
            data.put("percent", percent);
        } else {
            data.put("percent", (Object) null);
        }
        notifyListeners("downloadProgress", data);
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

                // 1. Choose progressive stream (muxed video+audio) locked to ~360p
                List<VideoStream> videoStreams = extractor.getVideoStreams();
                if (videoStreams == null || videoStreams.isEmpty()) {
                    JSObject res = new JSObject();
                    res.put("ok", false);
                    res.put("code", "NATIVE_ERROR");
                    res.put("message", "لم يتم العثور على صيغة فيديو قابلة للتحميل المباشر لهذا المحتوى");
                    call.resolve(res);
                    return;
                }

                // Download quality locked to ~360p; not user-configurable
                VideoStream selectedStream = select360pStream(videoStreams);

                if (selectedStream == null || selectedStream.getUrl() == null || selectedStream.getUrl().isEmpty()) {
                    JSObject res = new JSObject();
                    res.put("ok", false);
                    res.put("code", "NATIVE_ERROR");
                    res.put("message", "لا يتوفر تدفق فيديو بدقة 360p أو أقل لهذا المحتوى");
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

                // 3. Download the stream to disk with throttled progress updates
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

                    long contentLength = body.contentLength();
                    Long totalBytes = contentLength > 0 ? contentLength : null;

                    emitProgress(cleanVideoId, 0, totalBytes, totalBytes != null ? 0 : null);

                    long bytesDownloaded = 0;
                    long lastEmitTime = System.currentTimeMillis();
                    int lastEmitPercent = 0;

                    try (InputStream in = body.byteStream();
                         FileOutputStream out = new FileOutputStream(destinationFile)) {
                        byte[] buffer = new byte[16 * 1024];
                        int bytesRead;
                        while ((bytesRead = in.read(buffer)) != -1) {
                            out.write(buffer, 0, bytesRead);
                            bytesDownloaded += bytesRead;

                            long now = System.currentTimeMillis();
                            Integer percent = null;
                            if (totalBytes != null && totalBytes > 0) {
                                percent = (int) Math.min(100, (bytesDownloaded * 100) / totalBytes);
                            }

                            // Throttle updates: every 250ms or at least 2% progress change
                            boolean percentChanged = percent != null && (percent - lastEmitPercent >= 2);
                            boolean timeElapsed = (now - lastEmitTime >= 250);

                            if (percentChanged || timeElapsed) {
                                emitProgress(cleanVideoId, bytesDownloaded, totalBytes, percent);
                                lastEmitTime = now;
                                if (percent != null) {
                                    lastEmitPercent = percent;
                                }
                            }
                        }
                        out.flush();
                    }

                    // Final progress 100% notification
                    emitProgress(cleanVideoId, bytesDownloaded, totalBytes, 100);
                }

                // 4. Return success structured result with file path
                JSObject res = new JSObject();
                res.put("ok", true);
                res.put("status", "done");
                res.put("path", destinationFile.getAbsolutePath());
                res.put("message", "تم التحميل بنجاح في ذاكرة التطبيق (360p تجريبي)");
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

    /**
     * Delete a downloaded local file by its path under app storage.
     * Safely no-ops if file is already missing.
     */
    @PluginMethod
    public void deleteFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            JSObject res = new JSObject();
            res.put("ok", false);
            res.put("code", "INVALID");
            res.put("message", "مسار الملف غير محدد (Path is required)");
            call.resolve(res);
            return;
        }

        executor.execute(() -> {
            try {
                File target = new File(path.trim());
                if (!target.exists()) {
                    JSObject res = new JSObject();
                    res.put("ok", true);
                    res.put("message", "الملف غير موجود بالفعل");
                    call.resolve(res);
                    return;
                }

                // Security check: ensure target is within app files directory or external files directory
                File appInternal = getContext().getFilesDir();
                File appExternal = getContext().getExternalFilesDir(null);

                Path targetPath = target.getCanonicalFile().toPath().toAbsolutePath().normalize();
                boolean isInsideInternal = false;
                if (appInternal != null) {
                    Path internalPath = appInternal.getCanonicalFile().toPath().toAbsolutePath().normalize();
                    isInsideInternal = targetPath.startsWith(internalPath);
                }
                boolean isInsideExternal = false;
                if (appExternal != null) {
                    Path externalPath = appExternal.getCanonicalFile().toPath().toAbsolutePath().normalize();
                    isInsideExternal = targetPath.startsWith(externalPath);
                }

                if (!isInsideInternal && !isInsideExternal) {
                    JSObject res = new JSObject();
                    res.put("ok", false);
                    res.put("code", "INVALID");
                    res.put("message", "غير مسموح بحذف ملفات خارج مجلد التطبيق");
                    call.resolve(res);
                    return;
                }

                boolean deleted = target.delete();
                if (deleted) {
                    JSObject res = new JSObject();
                    res.put("ok", true);
                    res.put("message", "تم حذف الملف بنجاح");
                    call.resolve(res);
                } else {
                    JSObject res = new JSObject();
                    res.put("ok", false);
                    res.put("code", "NATIVE_ERROR");
                    res.put("message", "فشل حذف الملف من الذاكرة");
                    call.resolve(res);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error deleting file: " + path, e);
                JSObject res = new JSObject();
                res.put("ok", false);
                res.put("code", "NATIVE_ERROR");
                res.put("message", "خطأ أثناء محاولة حذف الملف: " + e.getMessage());
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
