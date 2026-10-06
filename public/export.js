/* Markdown -> Word (.docx) / PowerPoint (.pptx) exporters. Uses the docx and pptxgenjs libraries. */
"use strict";
// ===== shared exporter (also pasted into the page) =====
function inlineRuns(text){ // split **bold** and strip other md
  const out=[]; const re=/\*\*(.+?)\*\*|__(.+?)__/g; let i=0,m;
  const clean=s=>s.replace(/`([^`]+)`/g,"$1").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/(^|[^*])\*([^*]+)\*/g,"$1$2").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  while((m=re.exec(text))){ if(m.index>i) out.push({t:clean(text.slice(i,m.index))}); out.push({t:clean(m[1]||m[2]),b:true}); i=re.lastIndex; }
  if(i<text.length) out.push({t:clean(text.slice(i))});
  return out.filter(r=>r.t);
}
const plain=s=>inlineRuns(s).map(r=>r.t).join("");
function mdBlocks(md, marked){
  const blocks=[];
  const walkList=(list,level)=>{ list.items.forEach((it,idx)=>{
      const sub=it.tokens.filter(t=>t.type==="list"); const txt=it.tokens.filter(t=>t.type!=="list").map(t=>t.text||t.raw||"").join(" ").trim();
      blocks.push({type:"li",ordered:list.ordered,n:(list.start||1)+idx,level,text:txt});
      sub.forEach(s=>walkList(s,level+1)); }); };
  for(const t of marked.lexer(md)){
    if(t.type==="heading") blocks.push({type:"h",depth:t.depth,text:t.text});
    else if(t.type==="paragraph"||t.type==="text") blocks.push({type:"p",text:t.text});
    else if(t.type==="list") walkList(t,0);
    else if(t.type==="table") blocks.push({type:"table",header:t.header.map(c=>c.text),rows:t.rows.map(r=>r.map(c=>c.text))});
    else if(t.type==="blockquote") blocks.push({type:"p",text:t.text});
    else if(t.type==="code") blocks.push({type:"p",text:t.text});
  }
  return blocks;
}
async function toDocx(md,title,sub,{docx,marked}){
  const D=docx, kids=[];
  const runs=(s,extra={})=>inlineRuns(s).map(r=>new D.TextRun({text:r.t,bold:r.b||extra.bold}));
  kids.push(new D.Paragraph({heading:D.HeadingLevel.TITLE,children:[new D.TextRun(title)]}));
  if(sub) kids.push(new D.Paragraph({children:[new D.TextRun({text:sub,color:"5B6878",size:20})],spacing:{after:240}}));
  for(const b of mdBlocks(md,marked)){
    if(b.type==="h") kids.push(new D.Paragraph({heading:[D.HeadingLevel.HEADING_1,D.HeadingLevel.HEADING_1,D.HeadingLevel.HEADING_2,D.HeadingLevel.HEADING_3][Math.min(b.depth,3)],children:runs(b.text)}));
    else if(b.type==="p") kids.push(new D.Paragraph({children:runs(b.text),spacing:{after:120}}));
    else if(b.type==="li") kids.push(new D.Paragraph({children:runs(b.text),...(b.ordered?{numbering:{reference:"num",level:Math.min(b.level,2)}}:{bullet:{level:Math.min(b.level,2)}})}));
    else if(b.type==="table"){
      const cell=(s,h)=>new D.TableCell({children:[new D.Paragraph({children:runs(s,{bold:h})})],shading:h?{fill:"E9EDF1"}:undefined,margins:{top:60,bottom:60,left:100,right:100}});
      kids.push(new D.Table({width:{size:100,type:D.WidthType.PERCENTAGE},rows:[new D.TableRow({tableHeader:true,children:b.header.map(h=>cell(h,true))}),...b.rows.map(r=>new D.TableRow({children:b.header.map((_,i)=>cell(r[i]||"",false))}))]}));
      kids.push(new D.Paragraph(""));
    }
  }
  const doc=new D.Document({
    styles:{default:{document:{run:{font:"Calibri",size:22}}}},
    numbering:{config:[{reference:"num",levels:[0,1,2].map(l=>({level:l,format:D.LevelFormat.DECIMAL,text:`%${l+1}.`,alignment:D.AlignmentType.START,style:{paragraph:{indent:{left:720*(l+1),hanging:360}}}}))}]},
    sections:[{children:kids}]});
  return D.Packer.toBlob(doc);
}
async function toPptx(md,title,sub,{PptxGenJS,marked}){
  const p=new PptxGenJS(); p.layout="LAYOUT_WIDE"; // 13.33 x 7.5
  const INK="18212E",MUTED="5B6878",ACC="1F4E8C",FONT="Calibri";
  let s=p.addSlide(); s.background={color:"F8FAFB"};
  s.addShape(p.ShapeType.rect,{x:0,y:0,w:0.25,h:7.5,fill:{color:ACC}});
  s.addText(title,{x:0.9,y:2.4,w:11.5,h:1.4,fontFace:FONT,fontSize:40,bold:true,color:INK,valign:"bottom"});
  if(sub) s.addText(sub,{x:0.9,y:3.9,w:11.5,h:0.6,fontFace:FONT,fontSize:18,color:MUTED});
  // group blocks into sections by heading
  const secs=[]; let cur={title:"Summary",items:[]};
  for(const b of mdBlocks(md,marked)){
    if(b.type==="h"){ if(cur.items.length||secs.length===0&&cur.title!=="Summary") secs.push(cur); else if(cur.items.length) secs.push(cur); cur={title:plain(b.text),items:[]}; }
    else cur.items.push(b);
  }
  if(cur.items.length) secs.push(cur);
  const newSlide=t=>{ const sl=p.addSlide(); sl.background={color:"FFFFFF"};
    sl.addShape(p.ShapeType.rect,{x:0,y:0,w:13.33,h:0.12,fill:{color:ACC}});
    sl.addText(t,{x:0.6,y:0.35,w:12.1,h:0.9,fontFace:FONT,fontSize:28,bold:true,color:INK,valign:"middle"}); return sl; };
  const MAX=900; // approx chars per slide
  for(const sec of secs){
    let bucket=[],len=0,part=0;
    const flush=()=>{ if(!bucket.length) return; const t=sec.title+(part?" (cont.)":""); part++;
      const sl=newSlide(t);
      const paras=bucket.map(b=>{
        if(b.type==="li") return [{text:plain(b.text),options:{bullet:b.ordered?{type:"number"}:true,indentLevel:b.level,paraSpaceAfter:6,breakLine:true}}];
        const r=inlineRuns(b.text); return r.map((x,i)=>({text:x.t,options:{bold:!!x.b,...(i===r.length-1?{breakLine:true,paraSpaceAfter:10}:{})}}));
      }).flat();
      const fs= len>650?16:len>400?18:20;
      sl.addText(paras,{x:0.7,y:1.4,w:11.9,h:5.6,fontFace:FONT,fontSize:fs,color:INK,valign:"top"});
      bucket=[];len=0; };
    for(const b of sec.items){
      if(b.type==="table"){ flush();
        const rowsPer=8; for(let i=0;i<b.rows.length||i===0;i+=rowsPer){
          const sl=newSlide(sec.title+(part?" (cont.)":"")); part++;
          const hdr=b.header.map(h=>({text:plain(h),options:{bold:true,fill:{color:"E9EDF1"},color:INK}}));
          const rows=b.rows.slice(i,i+rowsPer).map(r=>b.header.map((_,j)=>({text:plain(r[j]||"")})));
          sl.addTable([hdr,...rows],{x:0.6,y:1.4,w:12.1,fontFace:FONT,fontSize:13,color:INK,border:{type:"solid",pt:0.75,color:"CBD3DC"},autoPage:false});
          if(!b.rows.length) break; }
        continue; }
      const l=plain(b.text).length+40; if(len+l>MAX&&bucket.length) flush(); bucket.push(b); len+=l;
    }
    flush();
  }
  return p.write({outputType:"blob"});
}
