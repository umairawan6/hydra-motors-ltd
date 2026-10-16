import {it,expect} from 'vitest';
import {suggestVehiclePrice} from '../lib/sale-price';
const options=[{value:'one',price:'8250'},{value:'two',price:'12250'}];
it('suggests stock price on initial selection and when replacing an unchanged suggestion',()=>{
  expect(suggestVehiclePrice({vehicle_id:'',list_price:''},{vehicle_id:'one',list_price:''},options,options).list_price).toBe('8250');
  expect(suggestVehiclePrice({vehicle_id:'one',list_price:'8250.00'},{vehicle_id:'two',list_price:'8250.00'},options,options).list_price).toBe('12250');
});
it('retains manually edited sale prices and leaves missing stock prices empty',()=>{
  expect(suggestVehiclePrice({vehicle_id:'one',list_price:'8000'},{vehicle_id:'two',list_price:'8000'},options,options).list_price).toBe('8000');
  expect(suggestVehiclePrice({vehicle_id:'',list_price:''},{vehicle_id:'missing',list_price:''},options,options).list_price).toBe('');
});
