import {rt} from '../i18n/runtime.js';
import si from 'systeminformation';import os from 'node:os';
export async function systemStats(ctx={}){const cpu=await si.currentLoad();const mem=await si.mem();const disks=await si.fsSize();return rt(ctx,'system_stats',{cpu:cpu.currentLoad.toFixed(1),active:(mem.active/1048576).toFixed(0),total:(mem.total/1048576).toFixed(0),storage:disks[0]?.use?.toFixed(1)||rt(ctx,'system_unknown'),os:os.type()+' '+os.release(),node:process.version,uptime:Math.floor(process.uptime())});}
