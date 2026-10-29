package cn.jeeweave.mobile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import org.json.*;

// Executes the production attachment implementation on isolated local files.
public final class WorkspaceFilesChecks {
  private static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);}
  private static JSONObject file(String path,String content)throws Exception{byte[] b=content.getBytes(StandardCharsets.UTF_8);return new JSONObject().put("path",path).put("base64",Base64.getEncoder().encodeToString(b)).put("sha256",WorkspaceFiles.sha(b));}
  private static int stages(File root){File[] f=new File(root,"captures/migrations").listFiles();return f==null?0:f.length;}
  public static void main(String[] args)throws Exception{
    File root=Files.createTempDirectory(Paths.get(args[0]),"native-attachments-").toFile();WorkspaceFiles service=new WorkspaceFiles(root);
    if(args.length>1){
      JSONObject desktop=new JSONObject(new String(Files.readAllBytes(Paths.get(args[1])),StandardCharsets.UTF_8));JSONObject input=new JSONObject().put("workspace",desktop.getJSONObject("workspace")).put("files",desktop.getJSONArray("files"));
      JSONObject saved=service.restore(input,next->new JSONObject().put("ok",true).put("workspace",next));JSONObject packed=service.pack(saved.getJSONObject("workspace"));
      check(packed.getJSONArray("files").length()==desktop.getJSONArray("files").length(),"Desktop round trip lost attachments");
      check(packed.getJSONObject("workspace").getJSONObject("data").getJSONArray("webCaptures").getJSONObject(0).getString("id").equals("stable-capture"),"Desktop round trip lost identity");
      Files.write(Paths.get(args[0],"native-returned.jiwei"),packed.toString().getBytes(StandardCharsets.UTF_8));System.out.println("Desktop to Android native attachment round trip passed.");return;
    }
    JSONObject workspace=new JSONObject().put("id","stable-workspace").put("revision",5).put("data",new JSONObject().put("webCaptures",new JSONArray().put(new JSONObject().put("id","stable-capture").put("directory","captures/web-captures/source"))));
    JSONObject attachment=file("captures/web-captures/source/page.txt","保留网页原文\nOriginal content"), empty=file("captures/web-captures/source/empty.txt","");
    JSONObject request=new JSONObject().put("workspace",workspace).put("files",new JSONArray().put(attachment).put(empty));
    JSONObject saved=service.restore(request,next->new JSONObject().put("ok",true).put("workspace",next));JSONObject restored=saved.getJSONObject("workspace");
    String dir=restored.getJSONObject("data").getJSONArray("webCaptures").getJSONObject(0).getString("directory");
    check(restored.getString("id").equals("stable-workspace"),"Workspace identity changed");check(dir.startsWith("captures/migrations/transfer-"),"Directory not remapped");
    check(new String(Files.readAllBytes(new File(root,dir+"/page.txt").toPath()),StandardCharsets.UTF_8).contains("保留网页原文"),"Attachment content changed");
    JSONObject packed=service.pack(restored);check(packed.getInt("packageVersion")==1&&packed.getJSONArray("files").length()==2,"Desktop envelope lost files");
    Files.write(Paths.get(args[0],"native-roundtrip.jiwei"),packed.toString().getBytes(StandardCharsets.UTF_8));
    int prior=stages(root);JSONObject damaged=new JSONObject(attachment.toString()).put("sha256",String.join("",Collections.nCopies(64,"0")));
    boolean rejected=false;try{service.restore(new JSONObject().put("workspace",workspace).put("files",new JSONArray().put(damaged)),next->{throw new AssertionError("Bad digest reached commit");});}catch(IOException expected){rejected=true;}check(rejected&&stages(root)==prior,"Bad digest wrote data");
    try{service.restore(request,next->{throw new IOException("Injected commit failure");});throw new AssertionError("Failed commit accepted");}catch(IOException expected){}check(stages(root)==prior,"Failed commit leaked staged attachments");
    JSONObject conflict=service.restore(request,next->new JSONObject().put("ok",false).put("message","revision conflict"));check(!conflict.getBoolean("ok")&&stages(root)==prior,"Conflict leaked staged attachments");
    for(String path:new String[]{"captures/web-captures/../x","captures/web-captures/CON.txt","/outside","captures/web-captures/x\\y"}){try{service.restore(new JSONObject().put("workspace",workspace).put("files",new JSONArray().put(file(path,"x"))),next->{throw new AssertionError("Invalid path reached commit");});throw new AssertionError("Invalid path accepted");}catch(IOException expected){}}
    JSONObject duplicate=new JSONObject(attachment.toString()).put("path","captures/web-captures/source/PAGE.txt");try{service.restore(new JSONObject().put("workspace",workspace).put("files",new JSONArray().put(attachment).put(duplicate)),next->{throw new AssertionError("Duplicate reached commit");});throw new AssertionError("Duplicate accepted");}catch(IOException expected){}
    System.out.println("Native attachment checks passed: real files, hashes, empty file, stable identities, Desktop envelope, path/case validation, failed commit/conflict cleanup.");
  }
}
