package app.youngtube.app;

import android.app.Presentation;
import android.content.Context;
import android.os.Bundle;
import android.view.Display;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.FragmentActivity;
import androidx.mediarouter.app.MediaRouteChooserDialogFragment;
import androidx.mediarouter.app.MediaRouteDialogFactory;
import androidx.mediarouter.media.MediaControlIntent;
import androidx.mediarouter.media.MediaRouteSelector;
import androidx.mediarouter.media.MediaRouter;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.cast.CastMediaControlIntent;
import com.google.android.gms.cast.MediaInfo;
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.MediaMetadata;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.SessionManager;
import com.google.android.gms.cast.framework.SessionManagerListener;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.stream.StreamExtractor;
import org.schabi.newpipe.extractor.stream.VideoStream;

import java.net.URI;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "YoungTubeCast")
public class YoungTubeCastPlugin extends Plugin {
    private static volatile boolean newPipeInitialized = false;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private MediaRouter mediaRouter;
    private MediaRouteSelector selector;
    private MediaRouter.Callback mediaRouterCallback;
    private CastContext castContext;
    private SessionManagerListener<CastSession> castSessionListener;
    private String pendingMediaUrl;
    private String pendingTitle;
    private String pendingVideoId;
    private CastPresentation presentation;

    @Override
    public void load() {
        super.load();
        mediaRouter = MediaRouter.getInstance(getContext());
        selector = new MediaRouteSelector.Builder()
                .addControlCategory(CastMediaControlIntent.categoryForCast(
                        CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID))
                .addControlCategory(MediaControlIntent.CATEGORY_LIVE_VIDEO)
                .build();
        mediaRouterCallback = new MediaRouter.Callback() {
            @Override
            public void onRouteSelected(@NonNull MediaRouter router, @NonNull MediaRouter.RouteInfo route) {
                showPresentationIfNeeded(route);
            }

            @Override
            public void onRouteSelected(@NonNull MediaRouter router, @NonNull MediaRouter.RouteInfo route, int reason) {
                showPresentationIfNeeded(route);
            }

            @Override
            public void onRoutePresentationDisplayChanged(@NonNull MediaRouter router, @NonNull MediaRouter.RouteInfo route) {
                showPresentationIfNeeded(route);
            }

            @Override
            public void onRouteUnselected(@NonNull MediaRouter router, @NonNull MediaRouter.RouteInfo route) {
                if (presentation != null) {
                    presentation.dismiss();
                    presentation = null;
                }
            }

            @Override
            public void onRouteUnselected(@NonNull MediaRouter router, @NonNull MediaRouter.RouteInfo route, int reason) {
                if (presentation != null) {
                    presentation.dismiss();
                    presentation = null;
                }
            }
        };
        mediaRouter.addCallback(selector, mediaRouterCallback, MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY);
    }

    @PluginMethod
    public void openChooser(PluginCall call) {
        if (!(getActivity() instanceof FragmentActivity)) {
            resolve(call, false, "NO_ACTIVITY", "تعذر فتح اختيار الشاشة.");
            return;
        }
        try {
            MediaRouteChooserDialogFragment chooser =
                    MediaRouteDialogFactory.getDefault().onCreateChooserDialogFragment();
            chooser.setRouteSelector(selector);
            chooser.show(((FragmentActivity) getActivity()).getSupportFragmentManager(),
                    "YoungTubeCastChooser");
            resolve(call, true, "CHOOSER_OPEN", "اختار الشاشة التي تريد استخدام YoungTube عليها.");
        } catch (Exception e) {
            resolve(call, false, "CAST_UNAVAILABLE", "ميزة البث غير متاحة على هذا الجهاز حالياً.");
        }
    }

    @PluginMethod
    public void castVideo(PluginCall call) {
        String videoId = call.getString("videoId", "").trim();
        String title = call.getString("title", "YoungTube video");

        if (!videoId.matches("^[A-Za-z0-9_-]{11}$")) {
            resolve(call, false, "INVALID_VIDEO_ID", "معرف الفيديو غير صالح.");
            return;
        }

        pendingVideoId = videoId;
        pendingTitle = title == null || title.trim().isEmpty() ? "YoungTube video" : title.trim();
        call.setKeepAlive(true);

        executor.execute(() -> {
            try {
                if (!newPipeInitialized) {
                    synchronized (YoungTubeCastPlugin.class) {
                        if (!newPipeInitialized) {
                            NewPipe.init(OkHttpDownloader.createDefault());
                            newPipeInitialized = true;
                        }
                    }
                }

                StreamExtractor extractor = ServiceList.YouTube.getStreamExtractor(
                        "https://www.youtube.com/watch?v=" + videoId);
                extractor.fetchPage();

                VideoStream best = selectCastStream(extractor.getVideoStreams());
                if (best == null || best.getUrl() == null || best.getUrl().trim().isEmpty()) {
                    getActivity().runOnUiThread(() -> resolve(call, false, "NO_STREAM", "تعذر استخراج بث مباشر صالح للفيديو.") );
                    return;
                }

                pendingMediaUrl = best.getUrl();
                getActivity().runOnUiThread(() -> openRouteChooser(call));
            } catch (Exception e) {
                getActivity().runOnUiThread(() -> resolve(call, false, "EXTRACTION_FAILED", "تعذر تجهيز الفيديو للبث إلى الشاشة.") );
            }
        });
    }

    private VideoStream selectCastStream(List<VideoStream> streams) {
        if (streams == null || streams.isEmpty()) return null;
        VideoStream best = null;
        int bestHeight = -1;
        for (VideoStream stream : streams) {
            if (stream == null || stream.getUrl() == null || stream.getUrl().isEmpty()) continue;
            String resolution = stream.getResolution();
            int height = 0;
            if (resolution != null) {
                try {
                    String digits = resolution.replaceAll("[^0-9]", "");
                    if (!digits.isEmpty()) height = Integer.parseInt(digits);
                } catch (Exception ignored) {}
            }
            if (height > 0 && height > bestHeight) {
                best = stream;
                bestHeight = height;
            }
        }
        return best != null ? best : streams.get(0);
    }

    private void openRouteChooser(PluginCall call) {
        if (!(getActivity() instanceof FragmentActivity)) {
            resolve(call, false, "NO_ACTIVITY", "تعذر فتح اختيار الشاشة.");
            return;
        }

        try {
            castContext = CastContext.getSharedInstance(getActivity());
            registerSessionListener();

            MediaRouteChooserDialogFragment chooser =
                    MediaRouteDialogFactory.getDefault().onCreateChooserDialogFragment();
            chooser.setRouteSelector(selector);
            chooser.show(((FragmentActivity) getActivity()).getSupportFragmentManager(),
                    "YoungTubeCastChooser");
            resolve(call, true, "CHOOSER_OPEN", "اختار الشاشة التي تريد تشغيل الفيديو عليها.");
        } catch (Exception e) {
            // If Cast framework is unavailable, keep a useful external-display fallback.
            try {
                showExternalDisplayChooser(call);
            } catch (Exception ignored) {
                resolve(call, false, "CAST_UNAVAILABLE", "ميزة البث غير متاحة على هذا الجهاز حالياً.");
            }
        }
    }

    private void registerSessionListener() {
        if (castContext == null) return;
        if (castSessionListener == null) {
            castSessionListener = new SessionManagerListener<CastSession>() {
                @Override public void onSessionStarting(@NonNull CastSession session) {}
                @Override public void onSessionStarted(@NonNull CastSession session, @NonNull String sessionId) { loadOnCastSession(session); }
                @Override public void onSessionStartFailed(@NonNull CastSession session, int error) {}
                @Override public void onSessionEnding(@NonNull CastSession session) {}
                @Override public void onSessionEnded(@NonNull CastSession session, int error) {}
                @Override public void onSessionResuming(@NonNull CastSession session, @NonNull String sessionId) {}
                @Override public void onSessionResumed(@NonNull CastSession session, boolean wasSuspended) { loadOnCastSession(session); }
                @Override public void onSessionResumeFailed(@NonNull CastSession session, int error) {}
                @Override public void onSessionSuspended(@NonNull CastSession session, int reason) {}
            };
        }
        castContext.getSessionManager().addSessionManagerListener(castSessionListener, CastSession.class);
    }

    private void loadOnCastSession(@NonNull CastSession session) {
        if (pendingMediaUrl == null || pendingMediaUrl.isEmpty()) return;
        MediaMetadata metadata = new MediaMetadata(MediaMetadata.MEDIA_TYPE_MOVIE);
        metadata.putString(MediaMetadata.KEY_TITLE, pendingTitle);
        metadata.addImage(new com.google.android.gms.common.images.WebImage(
                android.net.Uri.parse("https://i.ytimg.com/vi/" + pendingVideoId + "/hqdefault.jpg")));

        String contentType = inferVideoContentType(pendingMediaUrl);
        MediaInfo info = new MediaInfo.Builder(pendingMediaUrl)
                .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
                .setContentType(contentType)
                .setMetadata(metadata)
                .build();

        session.getRemoteMediaClient().load(
                new MediaLoadRequestData.Builder().setMediaInfo(info).build());
        pendingMediaUrl = null;
    }

    private String inferVideoContentType(String url) {
        try {
            String path = new URI(url).getPath();
            if (path != null && path.toLowerCase().endsWith(".webm")) return "video/webm";
        } catch (Exception ignored) {}
        return "video/mp4";
    }

    private void showPresentationIfNeeded(@NonNull MediaRouter.RouteInfo route) {
        if (pendingVideoId == null || pendingVideoId.isEmpty()) return;
        Display display = route.getPresentationDisplay();
        if (display == null) return;
        try {
            if (presentation != null && presentation.getDisplay() == display) return;
            if (presentation != null) presentation.dismiss();
            presentation = new CastPresentation(getActivity(), display, pendingVideoId);
            presentation.show();
            pendingVideoId = null;
        } catch (Exception ignored) {
            // Keep local playback if the external display cannot be presented.
        }
    }

    private void showExternalDisplayChooser(PluginCall call) {
        if (mediaRouter == null || getActivity() == null) {
            resolve(call, false, "NO_ROUTER", "لا توجد خدمة شاشات خارجية متاحة.");
            return;
        }

        List<MediaRouter.RouteInfo> routes = mediaRouter.getRoutes();
        java.util.ArrayList<MediaRouter.RouteInfo> candidates = new java.util.ArrayList<>();
        for (MediaRouter.RouteInfo route : routes) {
            if (route == null || !route.isEnabled()) continue;
            if (route.getPresentationDisplay() != null) candidates.add(route);
        }

        if (candidates.isEmpty()) {
            resolve(call, false, "NO_EXTERNAL_DISPLAY", "لم يتم العثور على شاشة خارجية متاحة الآن.");
            return;
        }

        String[] names = new String[candidates.size()];
        for (int i = 0; i < candidates.size(); i++) names[i] = candidates.get(i).getName();

        new androidx.appcompat.app.AlertDialog.Builder(getActivity())
                .setTitle("اختار الشاشة")
                .setItems(names, (dialog, which) -> {
                    MediaRouter.RouteInfo route = candidates.get(which);
                    route.select();
                    Display display = route.getPresentationDisplay();
                    if (display != null) {
                        if (presentation != null) presentation.dismiss();
                        presentation = new CastPresentation(getActivity(), display, pendingVideoId);
                        presentation.show();
                        resolve(call, true, "EXTERNAL_DISPLAY", "تم تشغيل الفيديو على الشاشة الخارجية.");
                    } else {
                        resolve(call, false, "DISPLAY_UNAVAILABLE", "الشاشة المختارة لا تدعم عرض الفيديو الآن.");
                    }
                })
                .setNegativeButton("إلغاء", null)
                .show();
    }

    private void resolve(PluginCall call, boolean ok, String code, String message) {
        JSObject out = new JSObject();
        out.put("ok", ok);
        out.put("code", code);
        out.put("message", message);
        call.resolve(out);
    }

    @Override
    protected void handleOnDestroy() {
        if (mediaRouter != null && mediaRouterCallback != null) {
            mediaRouter.removeCallback(mediaRouterCallback);
        }
        if (castContext != null && castSessionListener != null) {
            castContext.getSessionManager().removeSessionManagerListener(castSessionListener, CastSession.class);
        }
        if (presentation != null) {
            presentation.dismiss();
            presentation = null;
        }
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    private static class CastPresentation extends Presentation {
        private final String videoId;

        CastPresentation(Context context, Display display, String videoId) {
            super(context, display);
            this.videoId = videoId;
        }

        @Override
        protected void onCreate(@Nullable Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);
            WebView view = new WebView(getContext());
            WebSettings settings = view.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            view.setWebViewClient(new WebViewClient());
            view.setLayoutParams(new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));
            setContentView(view);
            view.loadUrl(
                    "https://www.youtube.com/embed/" + videoId +
                    "?autoplay=1&playsinline=1&controls=1&rel=0&modestbranding=1");
        }
    }
}
