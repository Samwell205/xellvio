import {describe,it,expect} from "vitest";
import {boundedDatabase} from "./bounded-database.server";
describe("Bounded database requests",()=>{
 it("aborts a stalled database query instead of hanging the invocation",async()=>{
  let signal:AbortSignal|undefined;
  const query={select(){return this;},eq(){return this;},abortSignal(s:AbortSignal){signal=s;return this;},then(resolve:(v:unknown)=>void){signal?.addEventListener("abort",()=>resolve({error:"timeout"}),{once:true});}};
  const db=boundedDatabase({from:()=>query},10);
  expect(await db.from().select().eq()).toEqual({error:"timeout"});expect(signal?.aborted).toBe(true);
 });
 it("retains ordinary successful responses through chained query builders",async()=>{
  const query={select(){return this;},abortSignal(){return this;},then(resolve:(v:unknown)=>void){resolve({data:[{id:"persisted"}],error:null});}};
  const db=boundedDatabase({from:()=>query},100);
  expect(await db.from().select()).toEqual({data:[{id:"persisted"}],error:null});
 });
});