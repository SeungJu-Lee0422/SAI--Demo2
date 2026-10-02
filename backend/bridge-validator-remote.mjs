import {representativeInterests} from '../shared/conversation-topics.ts';
import {currentBridgeTopics} from './conversation-topics.mjs';

export function remoteBridgeValidator(env){
 const url=env.BRIDGE_VALIDATOR_URL,token=env.BRIDGE_VALIDATOR_TOKEN||env.GROUP_SOLVER_TOKEN;
 if(!url||!token||token.length<32)return undefined;
 return async(people,candidates,direct=[],signal)=>{
  const safePeople=representativeInterests(people).map(person=>({id:person.id,interests:person.interests.map(interest=>({...interest,...(interest.source?{source:{kind:interest.source.kind,label:interest.source.label,...(interest.source.detail?{detail:interest.source.detail}:{})}}:{})}))}));
  const timeout=AbortSignal.timeout(35000),activeSignal=signal?AbortSignal.any([signal,timeout]):timeout;
  const response=await (env.fetch||fetch)(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({people:safePeople,candidates,direct:direct.map(topic=>({label:topic.label,category:topic.category}))}),signal:activeSignal,redirect:'error'});
  if(!response.ok)throw new Error('연결 주제의 AI 검증 서버에 연결하지 못했어요.');
  const result=await response.json();if(!Array.isArray(result.matches)||result.matches.length>3)throw new Error('연결 주제의 AI 검증 응답을 확인해주세요.');
  // The authenticated verifier returns scores; reconstruct evidence from current data.
  return currentBridgeTopics(people,result.matches);
 };
}
