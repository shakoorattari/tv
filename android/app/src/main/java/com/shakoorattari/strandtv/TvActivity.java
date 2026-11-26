package com.shakoorattari.strandtv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
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
        browser = new WebView(this);
        screen.addView(browser);
        setContentView(screen);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " StrandTVAndroid/" + Updater.installedVersion(this));
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
        updater = new Updater(this);
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
    @Override protected void onResume() { super.onResume(); browser.onResume(); updater.onResume(); }
    @Override protected void onDestroy() {
        updater.close();
        leaveFullscreen();
        screen.removeView(browser);
        browser.destroy();
        super.onDestroy();
    }
}
