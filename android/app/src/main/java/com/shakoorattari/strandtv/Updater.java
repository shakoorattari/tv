package com.shakoorattari.strandtv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONArray;
import org.json.JSONObject;

/** Required in-app updates: one dialog that offers, downloads, verifies and hands off to the system installer. */
final class Updater {
    private static final String VERSION_URL = "https://shakoorattari.com/tv/version.json";
    private static final String APK_URL = "https://shakoorattari.com/tv/strand-tv.apk";
    private static final long RECHECK_MS = 10 * 60 * 1000;

    private enum Step { OFFER, PERMISSION, DOWNLOADING, READY, FAILED }

    private static final class Release {
        final int versionCode;
        final String versionName, sha256, notes;
        final long size;
        Release(JSONObject json) {
            versionCode = json.optInt("versionCode");
            versionName = json.optString("versionName", "1.0." + versionCode);
            sha256 = json.optString("sha256", "");
            size = json.optLong("size", -1);
            StringBuilder list = new StringBuilder();
            JSONArray changes = json.optJSONArray("notes");
            for (int i = 0; changes != null && i < changes.length() && i < 5; i++) {
                list.append("\n\u2022 ").append(changes.optString(i));
            }
            notes = list.toString();
        }
    }

    private final Activity activity;
    private final File dir;
    private AlertDialog dialog;
    private TextView text;
    private ProgressBar bar;
    private Step step;
    private Release release;
    private File apk;
    private boolean checking, snoozed;
    private volatile boolean closed;
    private long lastCheck = -RECHECK_MS;

    Updater(Activity activity) {
        this.activity = activity;
        dir = new File(activity.getCacheDir(), "updates");
        int installed = installedVersion(activity);
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) if (versionInName(f) <= installed) f.delete();
        SharedPreferences prefs = activity.getSharedPreferences("updates", Context.MODE_PRIVATE);
        int previous = prefs.getInt("version", installed);
        if (installed > previous) {
            Toast.makeText(activity, "Strand TV updated to " + installedName(activity), Toast.LENGTH_LONG).show();
        }
        prefs.edit().putInt("version", installed).apply();
    }

    static int installedVersion(Context context) {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return versionOf(info);
        } catch (PackageManager.NameNotFoundException e) {
            return 0;
        }
    }

    static String installedName(Context context) {
        try {
            return context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "";
        }
    }

    @SuppressWarnings("deprecation")
    private static int versionOf(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? (int) info.getLongVersionCode() : info.versionCode;
    }

    private static int versionInName(File f) {
        String digits = f.getName().replaceAll("\\D", "");
        try { return digits.isEmpty() ? 0 : Integer.parseInt(digits); } catch (NumberFormatException e) { return 0; }
    }

    /** Call from onResume: picks up a granted install permission, otherwise checks for a release. */
    void onResume() {
        if (step == Step.PERMISSION && canInstall()) { download(); return; }
        if ((activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) return;
        if (dialog != null || checking || snoozed || SystemClock.elapsedRealtime() - lastCheck < RECHECK_MS) return;
        checking = true;
        lastCheck = SystemClock.elapsedRealtime();
        new Thread(() -> {
            Release found = null;
            try { found = fetchRelease(); } catch (Exception ignored) {}
            Release result = found;
            activity.runOnUiThread(() -> {
                checking = false;
                if (closed || result == null || result.versionCode <= installedVersion(activity)) return;
                release = result;
                offer();
            });
        }).start();
    }

    void close() {
        closed = true;
        if (dialog != null) dialog.dismiss();
        dialog = null;
    }

    private Release fetchRelease() throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(VERSION_URL + "?t=" + System.currentTimeMillis()).openConnection();
        c.setUseCaches(false);
        c.setConnectTimeout(8000);
        c.setReadTimeout(8000);
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            return new Release(new JSONObject(sb.toString()));
        } finally {
            c.disconnect();
        }
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || activity.getPackageManager().canRequestPackageInstalls();
    }

    private void offer() {
        show(Step.OFFER, "Update required",
            "Version " + release.versionName + " of Strand TV is ready. Update now to keep watching."
                + (release.notes.isEmpty() ? "" : "\n\nWhat\u2019s new" + release.notes),
            "Update now", "Exit");
    }

    private void start() {
        if (!canInstall()) {
            show(Step.PERMISSION, "Allow updates",
                "Strand TV needs your permission to install its update.\n\nChoose Open settings, turn on “Allow from this source”, then come back. The update continues automatically.",
                "Open settings", "Exit");
            return;
        }
        download();
    }

    private void openSettings() {
        try {
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + activity.getPackageName())));
        } catch (ActivityNotFoundException e) {
            // Some TVs have no per-app screen; the system installer asks for permission itself.
            download();
        }
    }

    private void download() {
        File target = new File(dir, "strand-tv-" + release.versionCode + ".apk");
        show(Step.DOWNLOADING, "Updating Strand TV", "Downloading the update…", null, "Exit");
        bar.setIndeterminate(true);
        Release wanted = release;
        new Thread(() -> {
            File part = new File(dir, target.getName() + ".part");
            try {
                if (!target.isFile() || !verify(target, wanted, sha256(target))) {
                    if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("There's no space to save the update.");
                    fetchApk(wanted, part);
                    if (!part.renameTo(target)) throw new IOException("The update couldn't be saved.");
                }
                activity.runOnUiThread(() -> { if (!closed) ready(target); });
            } catch (Exception e) {
                part.delete();
                String reason = e instanceof IOException && e.getMessage() != null ? e.getMessage()
                    : "Check the internet connection and try again.";
                activity.runOnUiThread(() -> { if (!closed) failed(reason); });
            }
        }).start();
    }

    private void fetchApk(Release wanted, File part) throws Exception {
        // The version query string gets past CDN copies of an older APK.
        HttpURLConnection c = (HttpURLConnection) new URL(APK_URL + "?v=" + wanted.versionCode).openConnection();
        c.setUseCaches(false);
        c.setConnectTimeout(10000);
        c.setReadTimeout(20000);
        try {
            if (c.getResponseCode() != 200) throw new IOException("The update server answered " + c.getResponseCode() + ".");
            long total = wanted.size > 0 ? wanted.size : c.getContentLength();
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                byte[] buffer = new byte[64 * 1024];
                long done = 0;
                int read, shown = -1;
                while ((read = in.read(buffer)) > 0) {
                    if (closed) throw new IOException("Cancelled.");
                    out.write(buffer, 0, read);
                    digest.update(buffer, 0, read);
                    done += read;
                    int percent = total > 0 ? (int) Math.min(100, done * 100 / total) : -1;
                    if (percent != shown) {
                        shown = percent;
                        activity.runOnUiThread(() -> progress(percent));
                    }
                }
            }
            if (!verify(part, wanted, hex(digest.digest()))) {
                throw new IOException("The download didn't match the published update.");
            }
        } finally {
            c.disconnect();
        }
    }

    /** The file must match the published checksum and be a newer build of this same app. */
    private boolean verify(File file, Release wanted, String sha) {
        if (!wanted.sha256.isEmpty() && !wanted.sha256.equalsIgnoreCase(sha)) return false;
        PackageInfo info = activity.getPackageManager().getPackageArchiveInfo(file.getPath(), 0);
        return info != null && activity.getPackageName().equals(info.packageName)
            && versionOf(info) > installedVersion(activity);
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) > 0) digest.update(buffer, 0, read);
        }
        return hex(digest.digest());
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
        return sb.toString();
    }

    private void progress(int percent) {
        if (closed || step != Step.DOWNLOADING) return;
        bar.setIndeterminate(percent < 0);
        if (percent >= 0) {
            bar.setProgress(percent);
            text.setText("Downloading the update… " + percent + "%");
        }
    }

    private void ready(File file) {
        apk = file;
        show(Step.READY, "Restart to update",
            "The update is downloaded. Strand TV will close while it installs.\n\nWhen the installer finishes, choose Open to restart Strand TV.",
            "Restart now", "Exit");
    }

    private void install() {
        Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE)
            .setDataAndType(ApkProvider.uriFor(activity, apk), "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(intent);
        } catch (ActivityNotFoundException e) {
            failed("This device has no app installer available.");
        }
    }

    private void failed(String reason) {
        show(Step.FAILED, "Update didn’t finish", reason, "Try again", "Later");
    }

    private void show(Step next, String title, String message, String primary, String secondary) {
        step = next;
        if (dialog == null) build();
        dialog.setTitle(title);
        text.setText(message);
        bar.setVisibility(next == Step.DOWNLOADING ? View.VISIBLE : View.GONE);
        Button yes = dialog.getButton(DialogInterface.BUTTON_POSITIVE);
        Button no = dialog.getButton(DialogInterface.BUTTON_NEGATIVE);
        yes.setVisibility(primary == null ? View.GONE : View.VISIBLE);
        if (primary != null) yes.setText(primary);
        no.setText(secondary);
        (primary == null ? no : yes).requestFocus();
    }

    private void build() {
        float density = activity.getResources().getDisplayMetrics().density;
        int pad = (int) (24 * density);
        LinearLayout box = new LinearLayout(activity);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(pad, (int) (8 * density), pad, 0);
        text = new TextView(activity);
        text.setTextAppearance(android.R.style.TextAppearance_Material_Subhead);
        bar = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        box.addView(text);
        box.addView(bar, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        ScrollView scroll = new ScrollView(activity);
        scroll.addView(box);
        dialog = new AlertDialog.Builder(activity)
            .setTitle(" ")
            .setView(scroll)
            .setCancelable(false)
            .setPositiveButton(" ", null)
            .setNegativeButton(" ", null)
            .create();
        dialog.setCanceledOnTouchOutside(false);
        dialog.show();
        // Set after show() so a click doesn't dismiss the dialog; each step decides what happens next.
        dialog.getButton(DialogInterface.BUTTON_POSITIVE).setOnClickListener(v -> primary());
        dialog.getButton(DialogInterface.BUTTON_NEGATIVE).setOnClickListener(v -> secondary());
    }

    private void primary() {
        if (step == Step.OFFER || step == Step.FAILED) start();
        else if (step == Step.PERMISSION) openSettings();
        else if (step == Step.READY) install();
    }

    private void secondary() {
        if (step == Step.FAILED) {
            // Never lock people out of the app because the update server is having trouble.
            snoozed = true;
            dialog.dismiss();
            dialog = null;
            step = null;
            return;
        }
        closed = true;
        activity.finish();
    }
}
