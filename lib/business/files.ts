export function fileKind(bytes:Uint8Array, allowPdf=false):{extension:string;mime:string}|null {
  if(bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) return {extension:'jpg',mime:'image/jpeg'};
  if(bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10') return {extension:'png',mime:'image/png'};
  if(String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP') return {extension:'webp',mime:'image/webp'};
  if(allowPdf && String.fromCharCode(...bytes.slice(0,5))==='%PDF-') return {extension:'pdf',mime:'application/pdf'};
  return null;
}
