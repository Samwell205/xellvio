/** Bound individual database requests without abandoning accepted-send cleanup. */
export function boundedDatabase<T extends object>(client:T, timeoutMs:number):T {
  const wrap=(target:object):object=>new Proxy(target,{
    get(object,key){
      const value=Reflect.get(object,key);
      if(key==="then" && typeof value==="function") {
        const query=object as {abortSignal?:(signal:AbortSignal)=>object};
        const bounded=query.abortSignal?.(AbortSignal.timeout(timeoutMs)) ?? object;
        return Reflect.get(bounded,"then").bind(bounded);
      }
      if(typeof value!=="function") return value;
      return (...args:unknown[])=>{
        const result=value.apply(object,args);
        return result && typeof result==="object" && ("then" in result || "select" in result) ? wrap(result):result;
      };
    },
  });
  return wrap(client) as T;
}