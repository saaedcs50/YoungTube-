package app.youngtube.app;

import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.Headers;
import okhttp3.OkHttpClient;
import okhttp3.RequestBody;
import okhttp3.ResponseBody;

/**
 * Minimal OkHttp Downloader bridge for NewPipe Extractor.
 * Handles HTTP requests requested by NewPipeExtractor with appropriate timeouts and headers.
 */
public class OkHttpDownloader extends Downloader {

    private static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

    private final OkHttpClient client;

    public OkHttpDownloader(OkHttpClient client) {
        this.client = client;
    }

    public static OkHttpDownloader createDefault() {
        OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .followRedirects(true)
                .followSslRedirects(true)
                .build();
        return new OkHttpDownloader(client);
    }

    @Override
    public Response execute(Request request) throws IOException, ReCaptchaException {
        String httpMethod = request.httpMethod();
        String url = request.url();
        Headers.Builder headersBuilder = new Headers.Builder();

        headersBuilder.add("User-Agent", USER_AGENT);

        Map<String, List<String>> requestHeaders = request.headers();
        if (requestHeaders != null) {
            for (Map.Entry<String, List<String>> entry : requestHeaders.entrySet()) {
                String headerName = entry.getKey();
                for (String headerValue : entry.getValue()) {
                    if (headerName != null && headerValue != null) {
                        headersBuilder.add(headerName, headerValue);
                    }
                }
            }
        }

        RequestBody requestBody = null;
        byte[] dataToSend = request.dataToSend();
        if (dataToSend != null && dataToSend.length > 0) {
            requestBody = RequestBody.create(dataToSend, null);
        }

        okhttp3.Request.Builder okRequestBuilder = new okhttp3.Request.Builder()
                .url(url)
                .method(httpMethod, requestBody)
                .headers(headersBuilder.build());

        Call call = client.newCall(okRequestBuilder.build());
        try (okhttp3.Response okResponse = call.execute()) {
            int code = okResponse.code();
            String message = okResponse.message();
            String latestUrl = okResponse.request().url().toString();
            Map<String, List<String>> responseHeaders = okResponse.headers().toMultimap();

            String responseBodyString = null;
            ResponseBody body = okResponse.body();
            if (body != null) {
                responseBodyString = body.string();
            }

            return new Response(code, message, responseHeaders, responseBodyString, latestUrl);
        }
    }
}
