package cn.jeeweave.mobile;
import android.app.*;import android.content.*;import android.os.Build;import android.util.AtomicFile;import org.json.*;import java.io.*;import java.util.*;
public class ReminderReceiver extends android.content.BroadcastReceiver {
  static boolean enabled(Context c,String id){try{File file=new File(c.getFilesDir(),"data/workspace.json");if(!file.exists())return true;try(InputStream in=new AtomicFile(file).openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);JSONObject flags=new JSONObject(out.toString("UTF-8")).getJSONObject("data").getJSONObject("preferences").optJSONObject("modules");return flags==null||flags.optJSONObject("enabled")==null||flags.getJSONObject("enabled").optBoolean(id,true);}}catch(Exception e){return false;}}
  static int reconcile(Context c)throws Exception{synchronized(ReminderReceiver.class){int count=0;boolean on=enabled(c,"reminders");AlarmManager alarms=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);JSONArray rows=read(c);for(int j=0;j<rows.length();j++){JSONObject row=rows.getJSONObject(j);alarms.cancel(pending(c,row));if(!on||row.optBoolean("archived")||!row.optString("mode","timed").equals("timed"))continue;JSONObject scheduleRow=new JSONObject(row.toString());if(row.optBoolean("daily"))scheduleRow.put("at",nextDaily(row));else if(row.optBoolean("delivered")||row.optLong("at")<=System.currentTimeMillis())continue;schedule(c,scheduleRow);count++;}return count;}}
  static JSONArray read(Context c)throws Exception{File f=new File(c.getFilesDir(),"data/reminders.json");if(!f.exists()&&!new File(f.getPath()+".bak").exists())return new JSONArray();try(InputStream in=new AtomicFile(f).openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return new JSONArray(out.toString("UTF-8"));}}
  static void write(Context c,JSONArray rows)throws Exception{File f=new File(c.getFilesDir(),"data/reminders.json");f.getParentFile().mkdirs();AtomicFile a=new AtomicFile(f);FileOutputStream out=a.startWrite();try{out.write(rows.toString().getBytes("UTF-8"));a.finishWrite(out);}catch(Exception e){a.failWrite(out);throw e;}}
  static PendingIntent pending(Context c,JSONObject row){return PendingIntent.getBroadcast(c,0,new Intent(c,ReminderReceiver.class).setAction("remind").setData(android.net.Uri.parse("jeeweave://reminder/"+row.optString("id"))).putExtra("id",row.optString("id")),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
  static void schedule(Context c,JSONObject row)throws Exception{if(!enabled(c,"reminders")||row.optBoolean("archived")||!row.optString("mode","timed").equals("timed"))return;AlarmManager a=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);long at=row.getLong("at");if(Build.VERSION.SDK_INT<31||a.canScheduleExactAlarms())a.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending(c,row));else a.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending(c,row));}
  static long nextDaily(JSONObject row){Calendar cal=Calendar.getInstance();cal.set(Calendar.HOUR_OF_DAY,row.optInt("hour",8));cal.set(Calendar.MINUTE,row.optInt("minute",0));cal.set(Calendar.SECOND,0);cal.set(Calendar.MILLISECOND,0);if(cal.getTimeInMillis()<=System.currentTimeMillis())cal.add(Calendar.DATE,1);return cal.getTimeInMillis();}
  @Override public void onReceive(Context c,Intent i){try{synchronized(ReminderReceiver.class){
    if(!enabled(c,"reminders"))return;
    JSONArray rows=read(c),next=new JSONArray();boolean restore=!"remind".equals(i.getAction());
    if(restore){reconcile(c);return;}
    for(int x=0;x<rows.length();x++){JSONObject row=rows.getJSONObject(x);
      if(row.optBoolean("archived")||!row.optString("mode","timed").equals("timed")){next.put(row);continue;}
      if(!row.optString("id").equals(i.getStringExtra("id"))){next.put(row);continue;}
      NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
      nm.createNotificationChannel(new NotificationChannel("jeeweave-reminders","几微提醒",NotificationManager.IMPORTANCE_HIGH));
      PendingIntent open=PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
      if(enabled(c,"reminders")&&(Build.VERSION.SDK_INT<33||c.checkSelfPermission("android.permission.POST_NOTIFICATIONS")==android.content.pm.PackageManager.PERMISSION_GRANTED))
        nm.notify(row.getString("id").hashCode(),new Notification.Builder(c,"jeeweave-reminders").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("几微提醒").setContentText(row.getString("title")).setStyle(new Notification.BigTextStyle().bigText(row.getString("title"))).setContentIntent(open).setAutoCancel(true).build());
      row.put("lastFired",System.currentTimeMillis()).put("delivered",true);next.put(row);
      if(row.optBoolean("daily")){JSONObject scheduled=new JSONObject(row.toString());scheduled.put("at",nextDaily(row));schedule(c,scheduled);}
    }write(c,next);
  }}catch(Exception ignored){android.util.Log.e("JeeWeaveReminder","Reminder scheduling failed");}}
}
