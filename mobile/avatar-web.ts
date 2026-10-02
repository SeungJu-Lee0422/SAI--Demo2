// Store a small, metadata-free preview, never the original upload.
export function chooseAvatar():Promise<string>{
 return new Promise((resolve,reject)=>{
  const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';
  input.oncancel=()=>resolve('');
  input.onchange=async()=>{const file=input.files?.[0];if(!file){resolve('');return;}try{
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('5MB 이하의 JPG·PNG·WebP 사진을 선택해주세요.');
   const bitmap=await createImageBitmap(file);if(!bitmap.width||!bitmap.height){bitmap.close();throw new Error('사진을 읽지 못했어요. 다른 사진을 선택해주세요.');}
   const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx){bitmap.close();throw new Error('사진 처리를 지원하지 않는 브라우저예요.');}
   const size=Math.min(bitmap.width,bitmap.height);ctx.fillStyle='white';ctx.fillRect(0,0,256,256);ctx.drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,256,256);bitmap.close();
   let uri=canvas.toDataURL('image/jpeg',.8);if(uri.length>80000)uri=canvas.toDataURL('image/jpeg',.5);if(uri.length>80000)throw new Error('사진을 줄이지 못했어요. 더 작은 사진을 선택해주세요.');resolve(uri);
  }catch(e){reject(e instanceof Error?e:new Error('사진을 읽지 못했어요. 다른 사진을 선택해주세요.'));}};
  input.click();
 });
}
