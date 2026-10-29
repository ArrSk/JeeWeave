package cn.jeeweave.mobile;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.json.*;

/** Desktop-compatible attachment envelope. Workspace commit is the last operation. */
final class WorkspaceFiles {
  interface Commit { JSONObject write(JSONObject workspace) throws Exception; }
  private final File root;
  WorkspaceFiles(File root) { this.root = root; }
  static String sha(byte[] bytes) throws Exception { StringBuilder s = new StringBuilder(); for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) s.append(String.format(Locale.US,"%02x",b & 255)); return s.toString(); }
  private static void safe(String name) throws IOException {
    if (!name.matches("^captures/(web-captures|course-captures|migrations)/.+") || name.matches(".*[\\\\:<>\"|?*\\x00-\\x1f].*")) throw new IOException("附件路径无效");
    for (String p : name.split("/",-1)) if (p.isEmpty() || p.endsWith(".") || p.endsWith(" ") || p.matches("(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\..*)?$")) throw new IOException("附件路径无效");
  }
  JSONObject restore(JSONObject request, Commit commit) throws Exception {
    JSONObject next = new JSONObject(request.getJSONObject("workspace").toString()); JSONArray files = request.getJSONArray("files");
    if (files.length() > 10000) throw new IOException("附件数量超过限制");
    Set<String> seen = new HashSet<>(); List<byte[]> contents = new ArrayList<>(); List<String> names = new ArrayList<>(); long total=0;
    for (int i=0;i<files.length();i++) {
      JSONObject f=files.getJSONObject(i); String name=f.getString("path"), encoded=f.getString("base64"); safe(name);
      if (!seen.add(name.toLowerCase(Locale.ROOT))) throw new IOException("重复附件路径");
      byte[] bytes=Base64.getDecoder().decode(encoded); total+=bytes.length;
      if(total>64L*1024*1024 || !Base64.getEncoder().encodeToString(bytes).equals(encoded) || !sha(bytes).equals(f.getString("sha256"))) throw new IOException("附件校验失败或超过 64 MiB");
      names.add(name);contents.add(bytes);
    }
    File stage=new File(root,"captures/migrations/transfer-"+UUID.randomUUID());
    try {
      for(int i=0;i<names.size();i++) { File target=new File(stage,names.get(i).substring(9)); if(!target.getCanonicalPath().startsWith(stage.getCanonicalPath()+File.separator))throw new IOException("附件越界"); target.getParentFile().mkdirs();try(FileOutputStream out=new FileOutputStream(target)){out.write(contents.get(i));out.getFD().sync();} }
      JSONArray records=next.getJSONObject("data").getJSONArray("webCaptures");
      for(int i=0;i<records.length();i++){JSONObject r=records.getJSONObject(i);String dir=r.optString("directory",""); for(String name:names)if(name.startsWith(dir+"/")){r.put("directory","captures/migrations/"+stage.getName()+"/"+dir.substring(9));break;}}
      JSONObject result=commit.write(next); if(!result.optBoolean("ok"))remove(stage,stage); return result;
    } catch(Exception e){remove(stage,stage);throw e;}
  }
  private void remove(File file, File stage) throws IOException { if(!stage.getName().startsWith("transfer-") || !file.getCanonicalPath().startsWith(stage.getCanonicalPath()))throw new IOException("拒绝清理非迁移目录");File[] children=file.listFiles();if(children!=null)for(File child:children)remove(child,stage);if(file.exists()&&!file.delete())throw new IOException("无法清理未提交附件"); }
  JSONObject pack(JSONObject workspace) throws Exception {
    JSONArray files=new JSONArray();long[] total={0}; for(String folder:new String[]{"web-captures","course-captures","migrations"})collect(new File(root,"captures/"+folder),"captures/"+folder,files,total);
    return new JSONObject().put("format","jeeweave-desktop-transfer").put("packageVersion",1).put("appVersion","0.3.0-mobile-beta.2").put("exportedAt",java.time.Instant.now().toString()).put("workspace",workspace).put("files",files);
  }
  private void collect(File file,String relative,JSONArray files,long[] total)throws Exception{
    if(!file.exists())return; if(!file.getCanonicalPath().startsWith(root.getCanonicalPath()+File.separator))throw new IOException("附件路径越界");
    if(file.isDirectory()){File[] children=file.listFiles();if(children==null)throw new IOException("无法读取附件目录");Arrays.sort(children);for(File child:children)collect(child,relative+"/"+child.getName(),files,total);return;}
    safe(relative);total[0]+=file.length();if(total[0]>64L*1024*1024||files.length()>=10000)throw new IOException("附件超过迁移限制");
    ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=new FileInputStream(file)){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)bytes.write(b,0,n);}
    byte[] b=bytes.toByteArray();files.put(new JSONObject().put("path",relative).put("base64",Base64.getEncoder().encodeToString(b)).put("sha256",sha(b)));
  }
}
