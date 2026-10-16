type PricedOption={value:string;price?:string};
export function suggestVehiclePrice(previous:Record<string,string>,next:Record<string,string>,oldOptions:PricedOption[],newOptions:PricedOption[]) {
  if(next.vehicle_id===previous.vehicle_id) return next;
  const oldPrice=oldOptions.find(option=>option.value===previous.vehicle_id)?.price;
  const suggested=newOptions.find(option=>option.value===next.vehicle_id)?.price;
  return !previous.list_price || (oldPrice!==undefined && Number(previous.list_price)===Number(oldPrice)) ? {...next,list_price:suggested ?? ''} : next;
}
