import {RuntimeInputError} from '../i18n/runtime.js';
import dayjs from 'dayjs';import utc from 'dayjs/plugin/utc.js';import timezone from 'dayjs/plugin/timezone.js';import customParseFormat from 'dayjs/plugin/customParseFormat.js';dayjs.extend(utc);dayjs.extend(timezone);dayjs.extend(customParseFormat);
export function zone(z='Asia/Kolkata'){try{new Intl.DateTimeFormat('en',{timeZone:z}).format();return z;}catch{throw new RuntimeInputError('invalid_timezone');}}
export function dateTime(z){return dayjs().tz(zone(z)).format('YYYY-MM-DD HH:mm:ss Z');}
export function deadline(text,z='Asia/Kolkata'){zone(z);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)||!dayjs(text,'YYYY-MM-DDTHH:mm',true).isValid())throw new RuntimeInputError('invalid_datetime');const d=dayjs.tz(text,z);if(d.format('YYYY-MM-DDTHH:mm')!==text)throw new RuntimeInputError('timezone_clock_change');return d.valueOf();}
export function countdown(text,z){const ms=deadline(text,z)-Date.now();if(ms<=0)throw new RuntimeInputError('time_past');return `${Math.floor(ms/86400000)}d ${Math.floor(ms/3600000)%24}h ${Math.floor(ms/60000)%60}m`;}
