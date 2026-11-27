package com.shakoorattari.strandtv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import org.json.JSONObject;

import java.util.Collections;

public final class TvActivity extends Activity {
    private static final String ORIGIN = "https://shakoorattari.com";
    private static final String HOME = ORIGIN + "/tv/";
    private FrameLayout screen;
    private WebView browser;
    private View fullscreen;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private Updater updater;
    private CancellationSignal googleRequest;

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
        configureWebBridges();
        browser.loadUrl(HOME);
        browser.requestFocus();
        updater = new Updater(this);
    }

    private void configureWebBridges() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(browser, "StrandApp",
            Collections.singleton(ORIGIN), (view, message, origin, mainFrame, reply) -> {
                if (!mainFrame || !isStrandPage(view.getUrl())) return;
                String action = message.getData();
                if ("landscape".equals(action) || "auto".equals(action)) {
                    setRequestedOrientation("landscape".equals(action)
                        ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : ActivityInfo.SCREEN_ORIENTATION_FULL_USER);
                }
            });
        if (BuildConfig.GOOGLE_CLIENT_ID.isEmpty()) return;
        WebViewCompat.addWebMessageListener(browser, "StrandGoogle",
            Collections.singleton(ORIGIN), (view, message, origin, mainFrame, reply) -> {
                if (!mainFrame || !isStrandPage(view.getUrl()) || !"sign-in".equals(message.getData())) return;
                signInWithGoogle(BuildConfig.GOOGLE_CLIENT_ID, reply);
            });
    }

    private boolean isStrandPage(String url) {
        if (url == null) return false;
        Uri page = Uri.parse(url);
        String path = page.getEncodedPath();
        return ORIGIN.equals(page.getScheme() + "://" + page.getEncodedAuthority())
            && ("/tv/".equals(path) || "/tv/index.html".equals(path));
    }

    private void signInWithGoogle(String clientId, JavaScriptReplyProxy reply) {
        if (googleRequest != null) {
            googleError(reply, "A Google sign-in is already open.");
            return;
        }
        boolean tv = getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK);
        if (tv && Build.VERSION.SDK_INT < 34) {
            googleError(reply, "Google sign-in on TV requires Android 14 or later.");
            return;
        }
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(clientId).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        googleRequest = new CancellationSignal();
        CredentialManager.create(this).getCredentialAsync(this, request, googleRequest, this::runOnUiThread,
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override public void onResult(GetCredentialResponse result) {
                    googleRequest = null;
                    if (isDestroyed()) return;
                    Credential credential = result.getCredential();
                    if (credential instanceof CustomCredential
                            && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                        try {
                            String token = GoogleIdTokenCredential.createFrom(credential.getData()).getIdToken();
                            reply.postMessage("{\"token\":" + JSONObject.quote(token) + "}");
                            return;
                        } catch (Exception ignored) {
                            googleError(reply, "Couldn’t read the Google credential.");
                            return;
                        }
                    }
                    googleError(reply, "Google didn’t return an account credential.");
                }

                @Override public void onError(GetCredentialException error) {
                    googleRequest = null;
                    if (!isDestroyed()) googleError(reply, error instanceof GetCredentialCancellationException
                        ? "Google sign-in was cancelled."
                        : "Google sign-in is unavailable. Check Google Play services and the app’s Firebase setup.");
                }
            });
    }

    private void googleError(JavaScriptReplyProxy reply, String message) {
        reply.postMessage("{\"error\":" + JSONObject.quote(message) + "}");
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
        if (googleRequest != null) googleRequest.cancel();
        updater.close();
        leaveFullscreen();
        screen.removeView(browser);
        browser.destroy();
        super.onDestroy();
    }
}
