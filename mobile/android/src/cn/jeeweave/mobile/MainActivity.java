package cn.jeeweave.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.AtomicFile;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;
import org.json.*;

/** Offline host. Only bundled, CSP-protected assets run in the bridge's WebView. */
public final class MainActivity extends Activity {
  private static final String ORIGIN = "https://appassets.androidplatform.net";
  private static final int OPEN = 10, SAVE = 11, UPLOAD = 12, LIMIT = 32 * 1024 * 1024;
  private WebView web;
  private AtomicFile workspace;
  private PortalPage portal;
  private NativeAssistant assistant;
  private boolean imeOpen;
  private final LocalBridge localBridge = new LocalBridge();
  private String requestId, exportText, exportName;
  private ValueCallback<Uri[]> upload;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    assistant = new NativeAssistant(this, (id,value) -> reply(id,value));
    android.content.pm.PackageInfo engine = WebView.getCurrentWebViewPackage();
    int major = 0;
    try { if (engine != null) major = Integer.parseInt(engine.versionName.split("\\.")[0]); } catch (Exception ignored) {}
    if (major < 108) {
      new AlertDialog.Builder(this).setTitle("请先更新系统 WebView").setMessage("几微需要 Android System WebView 或系统 Chrome 108 及以上版本。请在手机的应用商店更新后重新打开；当前没有修改本地资料。")
        .setPositiveButton("关闭", (dialog, which) -> finish()).setOnCancelListener(dialog -> finish()).show();
      return;
    }
    File data = new File(getFilesDir(), "data"); data.mkdirs();
    workspace = new AtomicFile(new File(data, "workspace.json"));
    FrameLayout root = new FrameLayout(this); root.setBackgroundColor(Color.WHITE);
    web = new WebView(this); root.addView(web, new FrameLayout.LayoutParams(-1, -1)); setContentView(root);
    root.setOnApplyWindowInsetsListener((view, insets) -> {
      if (Build.VERSION.SDK_INT >= 30) {
        android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
        view.setPadding(i.left, i.top, i.right, i.bottom);
      } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
      boolean keyboard = Build.VERSION.SDK_INT >= 30 ? insets.isVisible(WindowInsets.Type.ime()) : insets.getSystemWindowInsetBottom() > 120 * getResources().getDisplayMetrics().density;
      if (keyboard != imeOpen) { imeOpen = keyboard; web.evaluateJavascript("document.documentElement.dataset.imeOpen='" + keyboard + "'", null); }
      return insets.consumeSystemWindowInsets();
    });
    WebSettings s = web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
    s.setTextZoom(Math.round(getResources().getConfiguration().fontScale * 100));
    s.setAllowFileAccess(false); s.setAllowContentAccess(false); s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    s.setJavaScriptCanOpenWindowsAutomatically(false); s.setSupportMultipleWindows(false);
    web.setBackgroundColor(Color.WHITE); web.addJavascriptInterface(localBridge, "JeeWeaveNative");
    portal = new PortalPage(this, root, () -> web.evaluateJavascript("document.querySelector('#desktop-capture-course').click()",null));
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        Uri uri = r.getUrl(); String p = uri.getPath();
        if ("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost()) && uri.getPort() == -1 && p != null && p.startsWith("/assets/") && !p.contains("..") && !p.contains("\\")) {
          String file = p.substring(8);
          try {
            String mime = file.endsWith(".mjs") || file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".png") ? "image/png" : file.endsWith(".html") ? "text/html" : "application/json";
            return new WebResourceResponse(mime, "UTF-8", getAssets().open(file));
          } catch (IOException ignored) { return deny(404); }
        }
        return deny(403);
      }
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        if (!r.isForMainFrame()) return true;
        String url = r.getUrl().toString();
        if (url.startsWith(ORIGIN + "/assets/desktop/prototype.html") && (url.equals(ORIGIN + "/assets/desktop/prototype.html") || url.startsWith(ORIGIN + "/assets/desktop/prototype.html#"))) return false;
        if ("https".equals(r.getUrl().getScheme()) || "http".equals(r.getUrl().getScheme())) {
          try { startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())); } catch (Exception e) { Toast.makeText(MainActivity.this, "未找到浏览器", Toast.LENGTH_SHORT).show(); }
        }
        return true;
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (upload != null || requestId != null) { callback.onReceiveValue(null); return true; }
        upload = callback;
        try { Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("*/*"); startActivityForResult(i, UPLOAD); }
        catch (Exception e) { callback.onReceiveValue(null); upload = null; }
        return true;
      }
    });
    if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, () -> handleBack());
    web.loadUrl(ORIGIN + "/assets/desktop/prototype.html");
  }
  private WebResourceResponse deny(int status) { return new WebResourceResponse("text/plain", "UTF-8", status, status == 404 ? "Not Found" : "Forbidden", Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }
  private static String now() { SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US); f.setTimeZone(TimeZone.getTimeZone("UTC")); return f.format(new Date()); }
  private static JSONObject result(boolean ok, String message) { JSONObject o = new JSONObject(); try { o.put("ok", ok); if (message != null) o.put("message", message); } catch (JSONException ignored) {} return o; }
  private String readText(InputStream stream) throws IOException {
    try (InputStream in = stream; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192]; int n;
      while ((n = in.read(buffer)) != -1) { if (out.size() + n > LIMIT) throw new IOException("文件超过 32 MiB，请拆分资料后重试。"); out.write(buffer, 0, n); }
      return out.toString("UTF-8");
    }
  }
  private JSONObject readCurrent() throws Exception {
    try { return new JSONObject(readText(workspace.openRead())); }
    catch (FileNotFoundException e) { return null; }
  }
  private void atomic(AtomicFile file, byte[] bytes) throws IOException {
    FileOutputStream out = null;
    try { out = file.startWrite(); out.write(bytes); file.finishWrite(out); }
    catch (IOException e) { if (out != null) file.failWrite(out); throw e; }
  }
  public final class LocalBridge {
    @JavascriptInterface public synchronized String restoreTransfer(String text) {
      try { if(text.length()>128*1024*1024)throw new IOException("迁移包超过 128 MiB");return new WorkspaceFiles(new File(getFilesDir(),"data")).restore(new JSONObject(text),next->new JSONObject(writeWorkspace(next.toString(),true))).toString(); }
      catch(Exception e){return result(false,"迁移失败，原资料未覆盖："+e.getMessage()).toString();}
    }
    @JavascriptInterface public synchronized String readWorkspace() {
      try { JSONObject o = result(true, null); o.put("workspace", readCurrent()); o.put("paths", new JSONObject().put("root", "应用私有目录 / data")); return o.toString(); }
      catch (Exception e) { return result(false, "无法读取工作区，原文件未覆盖：" + e.getMessage()).toString(); }
    }
    @JavascriptInterface public synchronized String writeWorkspace(String text, boolean restore) {
      try {
        if (text.getBytes(StandardCharsets.UTF_8).length > LIMIT) throw new IOException("工作区超过 32 MiB，请先导出整理。");
        JSONObject next = new JSONObject(text), old = readCurrent();
        if (!"jeeweave-desktop-workspace".equals(next.getString("format")) || next.getInt("schemaVersion") != 1 || !next.has("data")) throw new IOException("不支持的数据格式");
        if (old != null && old.getLong("revision") != next.getLong("revision")) throw new IOException("资料已变化，请重新打开后重试。");
        if (old != null) {
          atomic(new AtomicFile(new File(getFilesDir(), "data/workspace.previous.json")), old.toString().getBytes(StandardCharsets.UTF_8));
          if (restore) atomic(new AtomicFile(new File(getFilesDir(), "data/before-import-" + System.currentTimeMillis() + ".json")), old.toString().getBytes(StandardCharsets.UTF_8));
        }
        next.put("revision", next.getLong("revision") + 1); next.put("updatedAt", now());
        atomic(workspace, next.toString().getBytes(StandardCharsets.UTF_8));
        return result(true, null).put("workspace", next).toString();
      } catch (Exception e) { return result(false, "保存失败，原资料未覆盖：" + e.getMessage()).toString(); }
    }
    @JavascriptInterface public void request(String id, String action, String payload) {
      runOnUiThread(() -> {
        try { if (assistant.handle(id,action,new JSONObject(payload))) return; } catch(Exception e){ reply(id,result(false,"请求无效"));return; }
        if ("portal-open".equals(action)) { try { portal.open(new JSONObject(payload).getString("url"));reply(id,result(true,"请在应用内登录并查询课表，点击顶部抓取课表。")); }catch(Exception e){reply(id,result(false,e.getMessage()));}return; }
        if ("portal-capture".equals(action)) { boolean debug=false;try{debug=readCurrent().getJSONObject("data").getJSONObject("preferences").optBoolean("developerMode");}catch(Exception ignored){}portal.capture(debug,value->reply(id,value));return; }
        if (requestId != null || upload != null) { reply(id, result(false, "请先完成当前文件选择。")); return; }
        try {
          JSONObject p = new JSONObject(payload); Intent intent;
          if ("export".equals(action)) {
            exportText = new WorkspaceFiles(new File(getFilesDir(),"data")).pack(readCurrent()).toString(); if(exportText.getBytes(StandardCharsets.UTF_8).length>128*1024*1024)throw new IOException("迁移包超过 128 MiB");
            exportName="JeeWeave-workspace.jiwei";intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.setType("application/octet-stream");intent.putExtra(Intent.EXTRA_TITLE,exportName);
          } else if ("save".equals(action)) {
            exportText = p.getString("text"); if (exportText.getBytes(StandardCharsets.UTF_8).length > LIMIT) throw new IOException("导出超过 32 MiB");
            exportName = p.optString("name", "JeeWeave-workspace.json").replaceAll("[\\\\/:*?\"<>|]", "_");
            intent = new Intent(Intent.ACTION_CREATE_DOCUMENT); intent.setType(p.optString("mime", "application/json")); intent.putExtra(Intent.EXTRA_TITLE, exportName);
          } else if ("open".equals(action)) { intent = new Intent(Intent.ACTION_OPEN_DOCUMENT); intent.setType("*/*"); }
          else throw new IOException("不支持的文件操作");
          intent.addCategory(Intent.CATEGORY_OPENABLE); requestId = id; startActivityForResult(intent, "open".equals(action) ? OPEN : SAVE);
        } catch (Exception e) { requestId = null; exportText = null; reply(id, result(false, e.getMessage())); }
      });
    }
    @JavascriptInterface public void finishApp() { runOnUiThread(() -> finish()); }
  }
  private void reply(String id, JSONObject response) { if(web==null||isFinishing()||isDestroyed())return;web.evaluateJavascript("window.jeeWeaveMobileResult && window.jeeWeaveMobileResult(" + JSONObject.quote(id) + "," + response.toString() + ")", null); }
  @Override protected void onActivityResult(int code, int status, Intent intent) {
    super.onActivityResult(code, status, intent);
    if (assistant.result(code,status,intent)) return;
    if (code == UPLOAD) { if (upload != null) upload.onReceiveValue(status == RESULT_OK && intent != null && intent.getData() != null ? new Uri[]{intent.getData()} : null); upload = null; return; }
    if (code != OPEN && code != SAVE) return;
    String id = requestId; requestId = null; if (id == null) return;
    try {
      JSONObject result = result(true, null);
      if (status != RESULT_OK || intent == null || intent.getData() == null) result.put("cancelled", true);
      else if (code == OPEN) result.put("text", readTransferText(getContentResolver().openInputStream(intent.getData())));
      else { try (OutputStream out = getContentResolver().openOutputStream(intent.getData(), "wt")) { if (out == null) throw new IOException("无法写入文件"); out.write(exportText.getBytes(StandardCharsets.UTF_8)); } result.put("path", exportName); }
      reply(id, result);
    } catch (Exception e) { reply(id, result(false, "文件操作失败：" + e.getMessage())); }
    finally { exportText = null; exportName = null; }
  }
  private String readTransferText(InputStream input)throws IOException{try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(out.size()+n>128*1024*1024)throw new IOException("迁移包超过 128 MiB");out.write(b,0,n);}return out.toString("UTF-8");}}
  private void handleBack() { if (web == null) { finish(); return; } if(portal!=null&&portal.visible()){portal.back();return;}web.evaluateJavascript("window.jeeWeaveMobileBack ? (window.jeeWeaveMobileBack(), true) : false", value -> { if (!"true".equals(value)) finish(); }); }
  @Override public void onBackPressed() { handleBack(); }
  @Override protected void onDestroy() { if(portal!=null)portal.destroy();if (web != null) { web.removeJavascriptInterface("JeeWeaveNative"); web.destroy(); } super.onDestroy(); }
}
