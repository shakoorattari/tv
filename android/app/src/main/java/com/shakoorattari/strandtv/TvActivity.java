package com.shakoorattari.strandtv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public final class TvActivity extends Activity {
    private static final String HOME = "https://shakoorattari.com/tv/";
    private static final String VERSION_URL = "https://shakoorattari.com/tv/version.json";
    private static final String APK_URL    = "https://shakoorattari.com/tv/strand-tv.apk";
    private FrameLayout screen;
    private WebView browser;
    private View fullscreen;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private long pendingDownloadId = -1;
    private BroadcastReceiver downloadReceiver;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        screen = new FrameLayout(this);
        browser = new WebView(this);
        screen.addView(browser);
        setContentView(screen);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " StrandTVAndroid/1");
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return request.isForMainFrame() && openExternal(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternal(Uri.parse(url));
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && !isFinishing()) {
                    new AlertDialog.Builder(TvActivity.this).setMessage("Couldn’t reach Strand TV. Check your internet connection.")
                        .setPositiveButton("Retry", (dialog, which) -> browser.loadUrl(HOME))
                        .setNegativeButton("Exit", (dialog, which) -> finish()).show();
                }
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreen != null) { callback.onCustomViewHidden(); return; }
                fullscreen = view;
                fullscreenCallback = callback;
                browser.setVisibility(View.GONE);
                screen.addView(view);
                view.requestFocus();
            }
            @Override public void onHideCustomView() { leaveFullscreen(); }
        });
        browser.loadUrl(HOME);
        browser.requestFocus();
        checkForUpdate();
    }

    private void checkForUpdate() {
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(VERSION_URL).openConnection();
                c.setConnectTimeout(6000);
                c.setReadTimeout(6000);
                BufferedReader reader = new BufferedReader(
                    new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();
                c.disconnect();
                int remote = new JSONObject(sb.toString()).getInt("versionCode");
                PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                int local = (Build.VERSION.SDK_INT >= 28)
                    ? (int) info.getLongVersionCode() : info.versionCode;
                if (remote > local) runOnUiThread(this::showUpdateDialog);
            } catch (Exception ignored) {}
        }).start();
    }

    private void showUpdateDialog() {
        new AlertDialog.Builder(this)
            .setTitle("Update Available")
            .setMessage("A new version of Strand TV is ready to install.")
            .setPositiveButton("Update Now", (d, w) -> startDownload())
            .setNegativeButton("Later", null)
            .show();
    }

    @SuppressLint("UnspecifiedRegisterReceiverFlag")
    private void startDownload() {
        DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(APK_URL))
            .setTitle("Strand TV Update")
            .setDescription("Downloading…")
            .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "strand-tv-update.apk")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        pendingDownloadId = dm.enqueue(req);
        downloadReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context ctx, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id == pendingDownloadId) {
                    unregisterReceiver(this);
                    downloadReceiver = null;
                    runOnUiThread(() -> installDownload(id));
                }
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(downloadReceiver, filter);
        }
        Toast.makeText(this, "Downloading update…", Toast.LENGTH_SHORT).show();
    }

    private void installDownload(long downloadId) {
        DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);

        // Confirm the download completed successfully
        DownloadManager.Query q = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor c = dm.query(q)) {
            if (c == null || !c.moveToFirst()) {
                Toast.makeText(this, "Download not found. Please try again.", Toast.LENGTH_LONG).show();
                return;
            }
            int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                Toast.makeText(this, "Download failed (error " + reason + "). Please try again.", Toast.LENGTH_LONG).show();
                return;
            }
        }

        // On Android 8+, the user must grant "Install unknown apps" for this app
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            new AlertDialog.Builder(this)
                .setTitle("Permission needed")
                .setMessage("To install updates, allow Strand TV to install apps. Tap Settings, enable 'Allow from this source', then start the update again.")
                .setPositiveButton("Open Settings", (d, w) -> {
                    Intent si = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName()));
                    si.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(si);
                })
                .setNegativeButton("Cancel", null)
                .show();
            return;
        }

        Uri apk = dm.getUriForDownloadedFile(downloadId);
        if (apk == null) {
            Toast.makeText(this, "Downloaded file not found. Please try again.", Toast.LENGTH_LONG).show();
            return;
        }
        Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE)
            .setData(apk)
            .setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK)
            .putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
        try { startActivity(intent); }
        catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Open the downloaded file to install.", Toast.LENGTH_LONG).show();
        }
    }

    private boolean openExternal(Uri uri) {
        if (!"https".equalsIgnoreCase(uri.getScheme())) return true;
        String path = uri.getPath();
        if ("shakoorattari.com".equalsIgnoreCase(uri.getHost()) && uri.getPort() == -1 &&
            path != null && path.startsWith("/tv/") && !path.endsWith(".apk")) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch (ActivityNotFoundException e) { Toast.makeText(this, "No app on this TV can open this link.", Toast.LENGTH_LONG).show(); }
        return true;
    }

    private void leaveFullscreen() {
        if (fullscreen == null) return;
        screen.removeView(fullscreen);
        fullscreen = null;
        browser.setVisibility(View.VISIBLE);
        fullscreenCallback.onCustomViewHidden();
        fullscreenCallback = null;
        browser.requestFocus();
    }

    @Override public void onBackPressed() {
        if (fullscreen != null) { leaveFullscreen(); return; }
        browser.evaluateJavascript("(function(){if(window.strandBack)return window.strandBack();var d=document.querySelector('dialog[open]');if(d){d.close();return true}return false})()", closed -> {
            if ("true".equals(closed)) return;
            if (browser.canGoBack()) browser.goBack(); else finish();
        });
    }
    @Override protected void onPause() { browser.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); browser.onResume(); }
    @Override protected void onDestroy() {
        if (downloadReceiver != null) {
            try { unregisterReceiver(downloadReceiver); } catch (Exception ignored) {}
            downloadReceiver = null;
        }
        leaveFullscreen();
        screen.removeView(browser);
        browser.destroy();
        super.onDestroy();
    }
}
