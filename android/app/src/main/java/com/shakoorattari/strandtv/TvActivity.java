package com.shakoorattari.strandtv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

public final class TvActivity extends Activity {
    private static final String HOME = "https://shakoorattari.com/tv/";
    private FrameLayout screen;
    private WebView browser;
    private View fullscreen;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private Updater updater;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        screen = new FrameLayout(this);
        screen.setBackgroundColor(0xFF0C1417);
        browser = new WebView(this);
        screen.addView(browser);
        setContentView(screen);
        if (Build.VERSION.SDK_INT >= 30) {
            // Draw edge to edge and keep the page clear of the status bar, navigation bar and camera cutout.
            getWindow().setDecorFitsSystemWindows(false);
            screen.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
        }
        applySystemBars();
        browser.addJavascriptInterface(new AppBridge(), "StrandApp");
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " StrandTVAndroid/" + Updater.installedVersion(this)
            + " StrandTVApp/" + Updater.installedName(this));
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return request.isForMainFrame() && openExternal(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternal(Uri.parse(url));
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                // A reload closes the player, so let go of any landscape lock it held.
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_USER);
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
        updater = new Updater(this);
    }

    /** Called from the web player's full-screen button. */
    private final class AppBridge {
        @JavascriptInterface public void setLandscape(boolean landscape) {
            runOnUiThread(() -> setRequestedOrientation(landscape
                ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : ActivityInfo.SCREEN_ORIENTATION_FULL_USER));
        }
    }

    /** Like YouTube: status and navigation bars in portrait, immersive full screen in landscape. */
    @SuppressWarnings("deprecation")
    private void applySystemBars() {
        boolean immersive = getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController bars = getWindow().getInsetsController();
            if (bars == null) return;
            if (immersive) {
                bars.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                bars.hide(WindowInsets.Type.systemBars());
            } else {
                bars.show(WindowInsets.Type.systemBars());
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(immersive
                ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                : View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    @Override public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        applySystemBars();
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applySystemBars();
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
    @Override protected void onResume() {
        super.onResume();
        browser.onResume();
        updater.onResume();
        // Returning to the app picks up a newer web build; the page may have stayed in memory for days.
        browser.evaluateJavascript("window.strandResume&&window.strandResume()", null);
    }
    @Override protected void onDestroy() {
        updater.close();
        leaveFullscreen();
        screen.removeView(browser);
        browser.destroy();
        super.onDestroy();
    }
}
