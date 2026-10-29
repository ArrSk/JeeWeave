package cn.jeeweave.mobile;
import android.app.*;import android.content.*;import android.os.Build;import android.util.AtomicFile;import org.json.*;import java.io.*;import java.util.*;
public class ReminderReceiver extends android.content.BroadcastReceiver {
  static JSONArray read(Context c)throws Exception{File f=new File(c.getFilesDir(),"data/reminders.json");if(!f.exists()&&!new File(f.getPath()+".bak").exists())return new JSONArray();try(InputStream in=new AtomicFile(f).openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return new JSONArray(out.toString("UTF-8"));}}
  static void write(Context c,JSONArray rows)throws Exception{File f=new File(c.getFilesDir(),"data/reminders.json");f.getParentFile().mkdirs();AtomicFile a=new AtomicFile(f);FileOutputStream out=a.startWrite();try{out.write(rows.toString().getBytes("UTF-8"));a.finishWrite(out);}catch(Exception e){a.failWrite(out);throw e;}}
  static PendingIntent pending(Context c,JSONObject row){return PendingIntent.getBroadcast(c,0,new Intent(c,ReminderReceiver.class).setAction("remind").setData(android.net.Uri.parse("jeeweave://reminder/"+row.optString("id"))).putExtra("id",row.optString("id")),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
  static void schedule(Context c,JSONObject row)throws Exception{AlarmManager a=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);long at=row.getLong("at");if(Build.VERSION.SDK_INT<31||a.canScheduleExactAlarms())a.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending(c,row));else a.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending(c,row));}
  static long nextDaily(JSONObject row){Calendar cal=Calendar.getInstance();cal.set(Calendar.HOUR_OF_DAY,row.optInt("hour",8));cal.set(Calendar.MINUTE,row.optInt("minute",0));cal.set(Calendar.SECOND,0);cal.set(Calendar.MILLISECOND,0);if(cal.getTimeInMillis()<=System.currentTimeMillis())cal.add(Calendar.DATE,1);return cal.getTimeInMillis();}
  @Override public void onReceive(Context c,Intent i){try{synchronized(ReminderReceiver.class){
    JSONArray rows=read(c),next=new JSONArray();boolean restore=!"remind".equals(i.getAction());
    for(int x=0;x<rows.length();x++){JSONObject row=rows.getJSONObject(x);
      if(restore){if(row.optBoolean("daily"))row.put("at",nextDaily(row));if(row.optLong("at")<System.currentTimeMillis())row.put("at",System.currentTimeMillis()+1000);schedule(c,row);next.put(row);continue;}
      if(!row.optString("id").equals(i.getStringExtra("id"))){next.put(row);continue;}
      NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
      nm.createNotificationChannel(new NotificationChannel("jeeweave-reminders","几微提醒",NotificationManager.IMPORTANCE_HIGH));
      PendingIntent open=PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
      if(Build.VERSION.SDK_INT<33||c.checkSelfPermission("android.permission.POST_NOTIFICATIONS")==android.content.pm.PackageManager.PERMISSION_GRANTED)
        nm.notify(row.getString("id").hashCode(),new Notification.Builder(c,"jeeweave-reminders").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("几微提醒").setContentText(row.getString("title")).setStyle(new Notification.BigTextStyle().bigText(row.getString("title"))).setContentIntent(open).setAutoCancel(true).build());
      if(row.optBoolean("daily")){row.put("at",nextDaily(row));next.put(row);schedule(c,row);}
    }write(c,next);
  }}catch(Exception ignored){android.util.Log.e("JeeWeaveReminder","Reminder scheduling failed");}}
}
