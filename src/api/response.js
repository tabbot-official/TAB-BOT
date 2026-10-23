// Every response uses one of two shapes: {success:true,data} or {success:false,error:{code,message}}.
export const ok = (data, status = 200) => ({status, body: {success: true, data}});
export const fail = (status, code, message, details) => ({status, body: {success: false, error: {code, message, ...(details ? {details} : {})}}});
