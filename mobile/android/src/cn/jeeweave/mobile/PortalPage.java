package cn.jeeweave.mobile;

import android.app.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.webkit.*;
import android.widget.*;
import android.view.*;
import java.io.*;
import java.util.*;
import org.json.*;

/** Remote login owns separate WebViews, never a local-workspace JavaScript bridge. */
final class PortalPage {
  interface Reply { void send(JSONObject result); }
  private final Activity activity; private final FrameLayout root; private final LinearLayout layout;
  private final FrameLayout content; private final TextView status; private final Runnable requestCapture;
  private final List<WebView> pages=new ArrayList<>(); private WebView current; private boolean capturing=false,disposed=false;
  private static final String HOME="https://vpn.njupt.edu.cn:8443/";
  private final Map<WebView,String> failures=new HashMap<>(); private String entryUrl; private boolean desktopSite=false;
  private final Handler handler=new Handler(Looper.getMainLooper());
  PortalPage(Activity activity,FrameLayout root,Runnable requestCapture){
    this.activity=activity;this.root=root;this.requestCapture=requestCapture;
    layout=new LinearLayout(activity);layout.setOrientation(LinearLayout.VERTICAL);layout.setBackgroundColor(Color.WHITE);
    status=new TextView(activity);status.setTextSize(14);status.setTextColor(Color.rgb(30,40,55));status.setPadding(dp(16),dp(12),dp(16),dp(8));layout.addView(status);
    LinearLayout tools=new LinearLayout(activity);
    add(tools,"返回几微",()->hide());Button more=add(tools,"更多",()->{});more.setOnClickListener(v->more(more));add(tools,"抓取课表",requestCapture);
    layout.addView(tools);content=new FrameLayout(activity);layout.addView(content,new LinearLayout.LayoutParams(-1,0,1));
    layout.setVisibility(View.GONE);root.addView(layout,new FrameLayout.LayoutParams(-1,-1));
  }
  private int dp(int value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
  private Button add(LinearLayout row,String text,Runnable action){
    Button button=new Button(activity);button.setText(text);button.setAllCaps(false);button.setTextSize(13);button.setMinHeight(dp(48));button.setPadding(dp(6),dp(8),dp(6),dp(8));
    boolean primary="抓取课表".equals(text);button.setTextColor(primary?Color.WHITE:Color.rgb(49,94,251));
    android.graphics.drawable.GradientDrawable background=new android.graphics.drawable.GradientDrawable();background.setColor(primary?Color.rgb(49,94,251):Color.rgb(239,243,255));background.setCornerRadius(dp(12));button.setBackground(background);
    button.setOnClickListener(v->action.run());LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(0,-2,1);params.setMargins(dp(6),dp(4),dp(6),dp(12));row.addView(button,params);return button;
  }
  private void more(View anchor){PopupMenu menu=new PopupMenu(activity,anchor);menu.getMenu().add(0,1,0,"VPN 首页");menu.getMenu().add(0,2,1,"后退");menu.getMenu().add(0,3,2,"刷新当前页");menu.getMenu().add(0,4,3,desktopSite?"使用手机版网页":"尝试电脑版网页");menu.setOnMenuItemClickListener(item->{if(item.getItemId()==1){reset(HOME);}else if(item.getItemId()==2){back();}else if(item.getItemId()==3&&current!=null){current.reload();}else if(item.getItemId()==4){desktopSite=!desktopSite;for(WebView page:pages)applyAgent(page);if(current!=null)current.reload();}return true;});menu.show();}
  private void applyAgent(WebView page){String agent=WebSettings.getDefaultUserAgent(activity);page.getSettings().setUserAgentString(desktopSite?agent.replace("; wv", "").replace("Android", "X11").replace("Mobile", ""):agent);}
  private void reset(String url){for(WebView page:pages){page.stopLoading();page.destroy();}pages.clear();failures.clear();content.removeAllViews();entryUrl=url;current=create();show(current);current.loadUrl(url);}
  static boolean valid(String url){try{Uri uri=Uri.parse(url);return "https".equals(uri.getScheme())&&uri.getHost()!=null&&uri.getUserInfo()==null&&!"appassets.androidplatform.net".equals(uri.getHost());}catch(Exception e){return false;}}
  void open(String url)throws Exception{if(!valid(url))throw new IOException("请填写有效的 HTTPS WebVPN 地址。");if(url.startsWith(HOME+"http/webvpn85b2e3dcbef5577474e4a553381b9cce/user-login/"))url=HOME;if(current==null||!url.equals(entryUrl))reset(url);else show(current);}
  private WebView create(){
    WebView page=new WebView(activity);WebSettings s=page.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setTextZoom(Math.round(activity.getResources().getConfiguration().fontScale*100));s.setSupportMultipleWindows(true);s.setJavaScriptCanOpenWindowsAutomatically(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(page,true);
    applyAgent(page);
    page.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest request){String url=request.getUrl().toString();if(valid(url))return false;status.setText("此链接暂不支持，请使用学校 WebVPN 中的网页入口。");return true;}
      @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){failures.remove(v);if(v==current)status.setText("正在加载教务页面…");}
      @Override public void onPageFinished(WebView v,String url){if(v==current)status.setText(failures.containsKey(v)?failures.get(v):"从 VPN 首页登录，进入教务系统查询课表后，再点“抓取课表”。");CookieManager.getInstance().flush();}
      private void fail(WebView v,String message){failures.put(v,message);if(v==current)status.setText(message);}
      @Override public void onReceivedHttpError(WebView v,WebResourceRequest r,WebResourceResponse response){if(r.isForMainFrame())fail(v,"页面返回 HTTP "+response.getStatusCode()+"。请在“更多 → VPN 首页”重新登录，再选择教务系统；仍不兼容可尝试电脑版网页。");}
      @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError error){if(r.isForMainFrame())fail(v,"连接失败（"+error.getErrorCode()+"），请检查网络，或在“更多”中回到 VPN 首页。");}
      @Override public void onReceivedSslError(WebView v,android.webkit.SslErrorHandler handler,android.net.http.SslError error){handler.cancel();fail(v,"学校页面的证书无法验证，请检查设备日期或联系学校；未继续连接。");}
    });
    page.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onCreateWindow(WebView view,boolean dialog,boolean gesture,Message message){if(pages.size()>=8){status.setText("打开的教务页面过多，请返回或重新进入。");return false;}WebView child=create();((WebView.WebViewTransport)message.obj).setWebView(child);message.sendToTarget();show(child);return true;}
      @Override public void onCloseWindow(WebView view){if(pages.size()>1){content.removeView(view);pages.remove(view);view.destroy();show(pages.get(pages.size()-1));}}
    });
    pages.add(page);content.addView(page,new FrameLayout.LayoutParams(-1,-1));return page;
  }
  private void show(WebView page){current=page;for(WebView p:pages)p.setVisibility(p==page?View.VISIBLE:View.GONE);layout.setVisibility(View.VISIBLE);layout.bringToFront();if(failures.containsKey(page))status.setText(failures.get(page));page.requestFocus();}
  void hide(){layout.setVisibility(View.GONE);}
  boolean visible(){return layout.getVisibility()==View.VISIBLE;}
  void back(){if(current!=null&&current.canGoBack())current.goBack();else if(pages.size()>1){WebView old=current;pages.remove(old);content.removeView(old);old.destroy();show(pages.get(pages.size()-1));}else hide();}
  void capture(boolean debug,Reply reply){
    if(current==null){reply.send(error("请先打开 WebVPN，登录并查询课表。"));return;}if(capturing){reply.send(error("正在读取课表，请稍候。"));return;}
    if(disposed){reply.send(error("教务页面已关闭，请重新打开。"));return;}if(failures.containsKey(current)){reply.send(error(failures.get(current)));return;}
    capturing=true;final WebView target=current;final String url=target.getUrl();final boolean[] delivered={false};
    Runnable timeout=()->{if(!delivered[0]){delivered[0]=true;capturing=false;reply.send(error("教务页面读取超时，请等待加载完成后再试。"));}};handler.postDelayed(timeout,12000);
    try{
      String script;try(InputStream in=activity.getAssets().open("portal-reader.js");ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);script=out.toString("UTF-8");}
      target.evaluateJavascript(script,encoded->{if(disposed||delivered[0])return;delivered[0]=true;capturing=false;handler.removeCallbacks(timeout);
        try{if(!Objects.equals(url,target.getUrl()))throw new IOException("课表页面已跳转，请重新抓取。");Object value=new JSONTokener(encoded).nextValue();JSONObject result=value instanceof String?new JSONObject((String)value):new JSONObject(encoded);
          if(result.optBoolean("ok")){Uri uri=Uri.parse(url);result.put("url",uri.buildUpon().clearQuery().fragment(null).build().toString());result.put("debug",debug);if(debug)result.put("debugText",result.optString("text")+"\n读取方式：Android 页面 DOM");hide();}
          reply.send(result);
        }catch(Exception e){reply.send(error("读取失败："+e.getMessage()+"。请查询学生课表后重试。"));}
      });
    }catch(Exception e){handler.removeCallbacks(timeout);capturing=false;delivered[0]=true;reply.send(error("读取组件未就绪，请重新打开应用。"));}
  }
  private static JSONObject error(String message){try{return new JSONObject().put("ok",false).put("message",message);}catch(Exception e){return new JSONObject();}}
  void destroy(){disposed=true;capturing=false;handler.removeCallbacksAndMessages(null);for(WebView page:pages)page.destroy();pages.clear();}
}
