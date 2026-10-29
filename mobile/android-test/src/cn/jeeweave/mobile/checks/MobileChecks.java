package cn.jeeweave.mobile.checks;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import java.io.*;
import java.lang.reflect.*;
import java.util.concurrent.*;
import org.json.*;

/** Test APK only. Does not ship in the application or connect to real accounts. */
public final class MobileChecks extends Instrumentation {
  private Activity activity; private WebView web; private Bundle args;
  @Override public void onCreate(Bundle arguments){super.onCreate(arguments);args=arguments;start();}
  private Object field(Object owner,String name)throws Exception{Field f=owner.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(owner);}
  private String js(String code)throws Exception{CountDownLatch latch=new CountDownLatch(1);String[] result={null};runOnMainSync(()->web.evaluateJavascript(code,value->{result[0]=value;latch.countDown();}));if(!latch.await(25,TimeUnit.SECONDS))throw new IOException("JavaScript timeout: "+code);return result[0];}
  private void yes(String code)throws Exception{if(!"true".equals(js(code)))throw new AssertionError(code+" => "+js(code));}
  private void click(String selector)throws Exception{js("document.querySelector("+JSONObject.quote(selector)+").click();true");}
  private String text(File file)throws Exception{try(InputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toString("UTF-8");}}
  private void ready()throws Exception{for(int i=0;i<160;i++){if("true".equals(js("document.documentElement.dataset.mobileReady==='true'")))return;Thread.sleep(250);}throw new AssertionError("Mobile boot timeout");}
  private void startApp()throws Exception{Intent intent=new Intent();intent.setClassName(getTargetContext().getPackageName(),"cn.jeeweave.mobile.MainActivity");intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);activity=startActivitySync(intent);web=(WebView)field(activity,"web");if(web==null)throw new AssertionError("No supported WebView");ready();}
  @Override public void onStart(){Bundle result=new Bundle();try{
    if(!getTargetContext().getPackageName().equals("cn.jeeweave.mobile.testbed")&&!Build.FINGERPRINT.contains("generic")&&!Build.MODEL.contains("sdk")&&!Build.MODEL.contains("Emulator"))throw new AssertionError("Physical devices require the isolated testbed package.");
    startApp();
    if("reopen".equals(args.getString("mode"))){yes("JSON.stringify(JSON.parse(JeeWeaveNative.readWorkspace()).workspace).includes('android-native-persist')");result.putString("stream","Native force-stop/reopen persistence passed\n");finish(Activity.RESULT_OK,result);return;}
    yes("window.JeeWeaveNative !== undefined && document.querySelector('.mobile-quickbar')!==null");
    click(".nav [data-view='settings']");if(!"true".equals(js("document.querySelector('#desktop-developer-mode').checked")))click("#desktop-developer-mode");click("#desktop-load-all-examples");
    click("#mobile-quick-note");click("#mobile-primary-action");js("document.querySelector('#desktop-journal-form').elements.body.value='android-native-persist';document.querySelector('#desktop-journal-form').elements.body.dispatchEvent(new Event('input',{bubbles:true}));true");
    if(!text(new File(getTargetContext().getFilesDir(),"data/workspace.json")).contains("android-native-persist"))throw new AssertionError("Draft not on native disk");
    runOnMainSync(()->((InputMethodManager)activity.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(web,InputMethodManager.SHOW_IMPLICIT));Thread.sleep(1000);
    yes("document.querySelector('#desktop-journal-form textarea').getBoundingClientRect().top < innerHeight");
    js("document.querySelector('#desktop-journal-form').requestSubmit();true");
    click(".mobile-quickbar [data-view=plans]");click("#mobile-primary-action");yes("document.querySelector('#desktop-plan-form').closest('dialog').open");
    runOnMainSync(()->activity.onBackPressed());yes("!document.querySelector('#desktop-plan-form').closest('dialog').open");
    click(".nav [data-view='courses']");yes("document.querySelectorAll('.desktop-timetable-course').length>0");
    // Native attachment SHA check, staged restore, rollback and Desktop envelope round trip.
    Object bridge=field(activity,"localBridge");Method read=bridge.getClass().getMethod("readWorkspace"),restore=bridge.getClass().getMethod("restoreTransfer",String.class);
    JSONObject before=new JSONObject((String)read.invoke(bridge)).getJSONObject("workspace");
    byte[] bytes="android original attachment".getBytes("UTF-8");java.security.MessageDigest digest=java.security.MessageDigest.getInstance("SHA-256");StringBuilder hash=new StringBuilder();for(byte b:digest.digest(bytes))hash.append(String.format("%02x",b&255));
    JSONObject file=new JSONObject().put("path","captures/web-captures/native/page.txt").put("base64",android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP)).put("sha256",hash.toString());
    JSONObject request=new JSONObject().put("workspace",before).put("files",new JSONArray().put(file));JSONObject imported=new JSONObject((String)restore.invoke(bridge,request.toString()));if(!imported.getBoolean("ok"))throw new AssertionError(imported.toString());
    JSONObject current=imported.getJSONObject("workspace");file.put("sha256",new String(new char[64]).replace('\0','0'));request.put("workspace",current);JSONObject failed=new JSONObject((String)restore.invoke(bridge,request.toString()));if(failed.optBoolean("ok"))throw new AssertionError("Bad digest accepted");if(new JSONObject((String)read.invoke(bridge)).getJSONObject("workspace").getLong("revision")!=current.getLong("revision"))throw new AssertionError("Failed import modified disk");
    Class<?> filesClass=Class.forName("cn.jeeweave.mobile.WorkspaceFiles");Constructor<?> ctor=filesClass.getDeclaredConstructor(File.class);ctor.setAccessible(true);Object files=ctor.newInstance(new File(getTargetContext().getFilesDir(),"data"));Method pack=filesClass.getDeclaredMethod("pack",JSONObject.class);pack.setAccessible(true);JSONObject envelope=(JSONObject)pack.invoke(files,current);
    if(envelope.getJSONArray("files").length()!=1)throw new AssertionError("Attachment not exported");File exported=new File(getTargetContext().getFilesDir(),"native-roundtrip.jiwei");try(FileOutputStream out=new FileOutputStream(exported)){out.write(envelope.toString().getBytes("UTF-8"));}
    js("document.documentElement.dataset.mobileReady='';location.reload();true");ready();
    // Exercise real remote WebView capture, with a synthetic timetable, never credentials.
    Object portal=field(activity,"portal");Method open=portal.getClass().getDeclaredMethod("open",String.class);open.setAccessible(true);runOnMainSync(()->{try{open.invoke(portal,"https://vpn.njupt.edu.cn:8443/");}catch(Exception e){throw new RuntimeException(e);}});
    WebView remote=(WebView)field(portal,"current");String fixture="<h1>学生课表</h1><table><tr><th>课表信息</th><th>节次</th><th>星期</th></tr><tr><td>Android课程 周数：1-15周(单) 上课地点：教西101 教师 ：测试教师 学分：1</td><td>1-2</td><td>星期一</td></tr></table>";
    runOnMainSync(()->remote.loadDataWithBaseURL("https://vpn.njupt.edu.cn:8443/fixture",fixture,"text/html","UTF-8",null));Thread.sleep(1500);
    WebView local=web;web=remote;yes("typeof JeeWeaveNative==='undefined'");web=local;
    js("window.nativeCapture=null;jeeWeaveDesktop.captureNow().then(value=>window.nativeCapture=value);true");
    for(int i=0;i<80;i++){if("true".equals(js("!!window.nativeCapture")))break;Thread.sleep(250);}yes("nativeCapture.ok && nativeCapture.text.includes('Android课程')");
    click(".nav [data-view='courses']");click("#desktop-open-course-settings");click("#desktop-open-import");click("#desktop-capture-course");
    boolean saved=false;for(int i=0;i<80;i++){if(text(new File(getTargetContext().getFilesDir(),"data/workspace.json")).contains("Android课程")){saved=true;break;}Thread.sleep(250);}if(!saved)throw new AssertionError("Native captured course was not imported");
    result.putString("stream","Android native: boot, quick entry, draft disk, keyboard viewport, return, attachment restore/digest/roundtrip, isolated portal DOM capture passed\n");finish(Activity.RESULT_OK,result);
  }catch(Throwable e){result.putString("stream",android.util.Log.getStackTraceString(e));finish(Activity.RESULT_CANCELED,result);}}
}
