import nodemailer from "nodemailer";
import ExcelJS from "exceljs";
import sharp from "sharp";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SMTP_USER", "SMTP_PASS"];
for (const key of required) if (!process.env[key]) throw new Error(`Secret ${key} belum tersedia`);
const base = process.env.SUPABASE_URL.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const filters = { area_group: process.env.REPORT_AREA || "", functional_location: process.env.REPORT_FUNLOC || "", category: process.env.REPORT_CATEGORY || "" };
const recipient = process.env.REPORT_RECIPIENT || process.env.REPORT_TO;
if (!recipient) throw new Error("REPORT_TO atau REPORT_RECIPIENT belum diisi");

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const response = await fetch(`${base}/rest/v1/${table}?select=*&offset=${from}&limit=1000`, { headers });
    if (!response.ok) throw new Error(`Supabase ${table} gagal ${response.status}: ${await response.text()}`);
    const batch = await response.json(); rows.push(...batch); if (batch.length < 1000) break;
  }
  return rows;
}
function pass(a) { return (!filters.area_group || a.area_group === filters.area_group) && (!filters.functional_location || a.functional_location === filters.functional_location) && (!filters.category || a.category === filters.category); }
async function compressedPhoto(url, targetKb = 90) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const input = Buffer.from(await response.arrayBuffer());
  let width = 900, quality = 68, output;
  for (let i = 0; i < 6; i++) {
    output = await sharp(input, { failOn: "none" }).rotate().resize({ width, height: 700, fit: "inside", withoutEnlargement: true }).flatten({ background: "white" }).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (output.length <= targetKb * 1024) break;
    width = Math.round(width * 0.82); quality = Math.max(42, quality - 7);
  }
  return output;
}

const [allAssets, allPhotos] = await Promise.all([fetchAll("assets"), fetchAll("asset_photos")]);
const assets = allAssets.filter(pass);
const assetMap = new Map(assets.map(a => [a.id, a]));
const photos = allPhotos.filter(p => p.is_active !== false && assetMap.has(p.asset_id));
const photoCount = new Map(); for (const p of photos) photoCount.set(p.asset_id, (photoCount.get(p.asset_id) || 0) + 1);

const workbook = new ExcelJS.Workbook(); workbook.creator = "PIM EI & OT"; workbook.created = new Date();
const assetsWs = workbook.addWorksheet("Asset Register", { views: [{ state: "frozen", ySplit: 1 }] });
assetsWs.columns = [
  { header:"No",key:"no",width:7 },{ header:"Category",key:"category",width:20 },{ header:"Tagname",key:"tagname",width:22 },
  { header:"Functional Location",key:"functional_location",width:44 },{ header:"Equipment No.",key:"equipment_no",width:23 },{ header:"Area",key:"area_group",width:18 },
  { header:"Condition",key:"condition",width:13 },{ header:"Status",key:"status",width:12 },{ header:"Dokumentasi",key:"documentation",width:22 },{ header:"Jumlah Foto",key:"photo_count",width:12 }
];
assets.forEach((a,i)=>assetsWs.addRow({ no:i+1, ...a, documentation:(photoCount.get(a.id)||0)>0?"Terdokumentasi":"Belum Ada Foto", photo_count:photoCount.get(a.id)||0 }));
const photoWs = workbook.addWorksheet("Photo Report", { views: [{ state: "frozen", ySplit: 1 }] });
photoWs.columns = [{header:"No",key:"no",width:7},{header:"Tagname",key:"tagname",width:22},{header:"Functional Location",key:"funloc",width:44},{header:"Area",key:"area",width:18},{header:"Condition",key:"condition",width:13},{header:"Keterangan",key:"description",width:42},{header:"Tanggal",key:"date",width:20},{header:"Foto",key:"photo",width:25}];
let embedded = 0, failed = 0;
for (let i=0; i<photos.length; i++) {
  const p=photos[i], a=assetMap.get(p.asset_id) || {};
  const row=photoWs.addRow({no:i+1,tagname:a.tagname||p.tagname||"",funloc:a.functional_location||p.functional_location||"",area:a.area_group||p.area_group||"",condition:p.condition||a.condition||"",description:p.description||"",date:new Date(p.taken_at||p.uploaded_at).toLocaleString("id-ID")}); row.height=92;
  try { const img=await compressedPhoto(p.photo_url); const id=workbook.addImage({buffer:img,extension:"jpeg"}); photoWs.addImage(id,{tl:{col:7.08,row:row.number-0.92},ext:{width:165,height:112}}); embedded++; }
  catch (error) { row.getCell(8).value="Foto gagal dimuat"; failed++; console.warn(`Foto ${p.id} dilewati: ${error.message}`); }
}
for (const ws of [assetsWs, photoWs]) { const h=ws.getRow(1); h.font={bold:true,color:{argb:"FFFFFFFF"}}; h.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF0F766E"}}; h.alignment={vertical:"middle"}; h.height=24; ws.autoFilter={from:{row:1,column:1},to:{row:1,column:ws.columnCount}}; ws.eachRow((row,n)=>{if(n>1) row.alignment={vertical:"middle",wrapText:true};}); }
const attachment = await workbook.xlsx.writeBuffer();
const attachmentMb = attachment.length/1024/1024;
if (attachmentMb > 18) throw new Error(`Lampiran ${attachmentMb.toFixed(1)} MB masih terlalu besar. Gunakan filter Area/Category agar di bawah 18 MB.`);

const smtpPass = process.env.SMTP_PASS.replace(/\s+/g, "");
const transporter = nodemailer.createTransport({ service:"gmail", auth:{user:process.env.SMTP_USER,pass:smtpPass}, connectionTimeout:30000, greetingTimeout:30000, socketTimeout:60000 });
await transporter.verify();
const today = new Date().toLocaleDateString("id-ID", { timeZone:"Asia/Jakarta", day:"2-digit", month:"long", year:"numeric" });
const filterText = Object.entries(filters).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join(" | ") || "Semua aset";
await transporter.sendMail({
  from: `"${process.env.EMAIL_FROM_NAME || "PIM Asset Report"}" <${process.env.SMTP_USER}>`, to: recipient,
  subject: `PIM EI & OT Asset Report - ${today}`,
  html:`<div style="font-family:Arial;color:#123238"><h2>PIM EI & OT Asset Report</h2><p><b>Filter:</b> ${filterText}</p><p>Total aset: <b>${assets.length}</b><br>Dokumentasi foto: <b>${photos.length}</b><br>Foto tertanam di Excel: <b>${embedded}</b>${failed?`<br>Foto gagal dimuat: <b>${failed}</b>`:""}</p><p>Lampiran Excel menggunakan foto JPEG terkompresi agar lebih ringan untuk email.</p></div>`,
  attachments:[{filename:`PIM-Asset-Photo-Report-${new Date().toISOString().slice(0,10)}.xlsx`,content:attachment,contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}]
});
console.log(`SUCCESS email=${recipient} assets=${assets.length} photos=${photos.length} embedded=${embedded} sizeMB=${attachmentMb.toFixed(2)}`);
