package app.youngtube.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "YoungTubeDownloader")
public class YoungTubeDownloaderPlugin extends Plugin {

    @PluginMethod
    public void download(PluginCall call) {
        String videoId = call.getString("videoId");
        String title = call.getString("title");

        if (videoId == null || videoId.trim().isEmpty()) {
            JSObject res = new JSObject();
            res.put("ok", false);
            res.put("code", "INVALID");
            res.put("message", "Video ID is required");
            call.resolve(res);
            return;
        }

        // Stub implementation: No NewPipe or background download engine wired yet
        JSObject res = new JSObject();
        res.put("ok", false);
        res.put("code", "NOT_IMPLEMENTED");
        res.put("message", "محرك التنزيل قيد التطوير ولم يتم ربطه بعد (Download engine not wired yet)");
        call.resolve(res);
    }
}
