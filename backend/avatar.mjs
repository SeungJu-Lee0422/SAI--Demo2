export function validateAvatar(value){
 if(value==='')return '';
 if(typeof value!=='string'||value.length>80000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw new Error('프로필 사진을 다시 선택해주세요.');
 const raw=atob(value.slice(value.indexOf(',')+1)),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 if(bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new Error('JPG 프로필 사진을 선택해주세요.');
 let i=2;while(i+4<bytes.length){if(bytes[i++]!==255)throw new Error('사진 형식을 확인해주세요.');while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;const len=bytes[i]*256+bytes[i+1];if(len<2||i+len>bytes.length)break;
  if([192,193,194].includes(marker)){const h=bytes[i+3]*256+bytes[i+4],w=bytes[i+5]*256+bytes[i+6];if(!w||!h||w>512||h>512)throw new Error('512px 이하의 프로필 사진을 선택해주세요.');return value;}i+=len;
 }
 throw new Error('사진 크기를 확인하지 못했어요. 다시 선택해주세요.');
}
