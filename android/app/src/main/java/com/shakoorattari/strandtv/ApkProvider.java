package com.shakoorattari.strandtv;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** Lets the system installer read a downloaded update; only verified update files are served, read-only. */
public final class ApkProvider extends ContentProvider {
    static Uri uriFor(Context context, File apk) {
        return new Uri.Builder().scheme("content").authority(context.getPackageName() + ".updates")
            .appendPath(apk.getName()).build();
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || !name.matches("strand-tv-\\d+\\.apk")) throw new FileNotFoundException(String.valueOf(name));
        File file = new File(new File(getContext().getCacheDir(), "updates"), name);
        if (!file.isFile()) throw new FileNotFoundException(name);
        return file;
    }

    @Override public boolean onCreate() { return true; }

    @Override public String getType(Uri uri) { return "application/vnd.android.package-archive"; }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Read only");
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        File file;
        try { file = fileFor(uri); } catch (FileNotFoundException e) { return null; }
        MatrixCursor cursor = new MatrixCursor(new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        cursor.addRow(new Object[] {file.getName(), file.length()});
        return cursor;
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }

    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { return 0; }

    @Override public int delete(Uri uri, String selection, String[] args) { return 0; }
}
