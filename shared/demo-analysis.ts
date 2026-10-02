import type { CommonInterest, DemoGroupQuality, DemoInterest, DemoProfile, DemoTopic } from './demo-types.ts';

// The bilingual topic descriptions are embedded together with imported records in the backend.
// This transparent demo taxonomy is editable; it is not a list of precomputed recommendations.
export const demoTopics: DemoTopic[] = [
  { id:'ai', label:'AI·머신러닝', category:'기술·AI', description:'인공지능 머신러닝 딥러닝 연구와 개발 Artificial intelligence machine learning deep learning neural networks', keywords:['ai','인공지능','머신러닝','딥러닝','artificial intelligence','machine learning','deep learning','neural network'], parent:'technology' },
  { id:'vision', label:'Computer Vision', category:'기술·AI', description:'컴퓨터 비전 이미지 인식 객체 탐지 영상처리 Computer vision image recognition object detection image processing', keywords:['computer vision','컴퓨터 비전','object detection','이미지 인식','영상처리','yolo'], parent:'ai' },
  { id:'data', label:'데이터 분석', category:'기술·AI', description:'데이터 분석 통계 데이터 사이언스 SQL 분석가 Data analysis statistics data science analytics SQL', keywords:['데이터 분석','데이터 사이언스','data science','data analysis','analytics','sql','통계'], parent:'ai' },
  { id:'coding', label:'프로그래밍', category:'기술·AI', description:'소프트웨어 개발 코딩 웹 앱 Python JavaScript software engineering programming coding web application development', keywords:['프로그래밍','코딩','개발자','software engineer','programming','python','javascript','react'], parent:'technology' },
  { id:'product', label:'제품·서비스 기획', category:'커리어', description:'제품 기획 서비스 기획 고객 문제 사용자 경험 스타트업 Product management service planning startups entrepreneurship', keywords:['product manager','product management','제품 기획','서비스 기획','스타트업','startup','entrepreneur'], parent:'career' },
  { id:'design', label:'UX·디자인', category:'디자인·콘텐츠', description:'사용자 경험 인터페이스 디자인 피그마 UX UI design interaction design Figma user experience', keywords:['디자인','ux','ui','figma','user experience','design'], parent:'creative' },
  { id:'jpop', label:'일본 음악', category:'음악', description:'일본 대중 음악 제이팝 J-pop Japanese music artists YOASOBI Ado King Gnu THE FIRST TAKE Kenshi Yonezu', keywords:['j-pop','jpop','일본 음악','일본 노래','yoasobi','ado','king gnu','the first take','요네즈','kenshi yonezu'], parent:'music' },
  { id:'kpop', label:'K-pop·한국 음악', category:'음악', description:'한국 대중 음악 케이팝 Korean pop music K-pop DAY6 데이식스 아이돌 IU', keywords:['k-pop','kpop','케이팝','한국 음악','day6','데이식스','아이유','iu'], parent:'music' },
  { id:'jazz', label:'재즈', category:'음악', description:'재즈 음악 피아노 즉흥연주 Jazz piano improvisation jazz live performance', keywords:['재즈','jazz'], parent:'music' },
  { id:'concert', label:'라이브 공연', category:'음악', description:'라이브 공연 콘서트 페스티벌 음악 공연 Concert live music festival gigs', keywords:['콘서트','공연','concert','live performance','music festival'], parent:'music' },
  { id:'japan', label:'일본 여행', category:'여행', description:'일본 여행 도쿄 교토 오사카 후쿠오카 Tokyo Kyoto Osaka Fukuoka Japan travel trip itinerary', keywords:['일본 여행','도쿄','교토','오사카','후쿠오카','tokyo','kyoto','osaka','fukuoka','japan travel'], parent:'travel' },
  { id:'travel', label:'여행', category:'여행', description:'여행 관광 새로운 도시 문화 여행 계획 Travel tourism sightseeing trips exploring cities', keywords:['여행','travel','trip','tourism','관광'] },
  { id:'photo', label:'사진', category:'디자인·콘텐츠', description:'사진 촬영 카메라 거리 사진 풍경 사진 Photography camera street landscape portrait photos', keywords:['사진','촬영','photography','camera','카메라'], parent:'creative' },
  { id:'exhibition', label:'전시·미술', category:'문화', description:'전시 미술 갤러리 박물관 현대미술 Art exhibition galleries museums contemporary visual arts', keywords:['전시','미술','갤러리','exhibition','gallery','museum','art museum'], parent:'culture' },
  { id:'film', label:'영화', category:'디자인·콘텐츠', description:'영화 시네마 감독 영화 리뷰 독립 영화 Films movies cinema directors film review independent cinema', keywords:['영화','시네마','cinema','movie','film'], parent:'creative' },
  { id:'books', label:'독서', category:'문화', description:'독서 책 문학 소설 독서 모임 Reading books literature novels book club', keywords:['독서','책 리뷰','문학','소설','reading','book club','literature','novel'], parent:'culture' },
  { id:'gaming', label:'게임', category:'게임', description:'비디오 게임 인디 게임 게임 개발 온라인 게임 Video games indie games gaming game development', keywords:['게임','gaming','video game','하데스','hades','젤다','zelda'] },
  { id:'running', label:'러닝', category:'운동', description:'달리기 러닝 마라톤 조깅 Running marathon jogging race training', keywords:['러닝','달리기','마라톤','running','marathon','jogging'], parent:'sports' },
  { id:'hiking', label:'등산·하이킹', category:'운동', description:'등산 하이킹 트레킹 산 자연 야외 활동 Hiking trekking mountain outdoors trails', keywords:['등산','하이킹','트레킹','hiking','trekking','trail'], parent:'sports' },
  { id:'climbing', label:'클라이밍', category:'운동', description:'클라이밍 암벽 등반 볼더링 실내 클라이밍 Rock climbing bouldering indoor climbing', keywords:['클라이밍','볼더링','암벽','climbing','bouldering'], parent:'sports' },
  { id:'fitness', label:'피트니스', category:'운동', description:'피트니스 헬스 근력 운동 요가 건강 운동 Fitness strength training workout gym yoga', keywords:['헬스','근력','피트니스','fitness','workout','gym','요가','yoga'], parent:'sports' },
  { id:'coffee', label:'커피', category:'음식', description:'커피 카페 원두 에스프레소 로스팅 Coffee cafe espresso beans roasting specialty coffee', keywords:['커피','카페','coffee','cafe','espresso','로스팅'], parent:'food' },
  { id:'cooking', label:'요리', category:'음식', description:'요리 레시피 집밥 베이킹 음식 만들기 Cooking recipes baking home cooking food preparation', keywords:['요리','레시피','베이킹','cooking','recipe','baking'], parent:'food' },
  { id:'food', label:'음식·맛집', category:'음식', description:'음식 맛집 미식 레스토랑 Food dining restaurants cuisine gastronomy', keywords:['맛집','음식','food','restaurant','cuisine','dining'] },
  { id:'career', label:'커리어·비즈니스', category:'커리어', description:'경력 직무 비즈니스 리더십 직업 개발 Career business leadership professional development', keywords:['경력','직무','커리어','career','business','leadership'] },
  { id:'marketing', label:'마케팅', category:'커리어', description:'마케팅 브랜드 광고 콘텐츠 마케팅 디지털 마케팅 Marketing branding advertising growth digital content marketing', keywords:['마케팅','브랜드','marketing','branding','advertising'], parent:'career' },
  { id:'language', label:'언어 학습', category:'공부', description:'외국어 학습 영어 일본어 회화 Language learning English Japanese conversation studying languages', keywords:['영어','일본어','외국어','language learning','english learning','japanese learning','회화'] },
  { id:'technology', label:'기술·소프트웨어', category:'기술·AI', description:'컴퓨터 소프트웨어 IT 인공지능 개발 기술 Technology software IT computing artificial intelligence', keywords:['소프트웨어','it 기술','technology','software'] },
  { id:'music', label:'음악', category:'음악', description:'음악 노래 아티스트 Music songs artists', keywords:['음악','노래','music','song'] },
  { id:'creative', label:'디자인·창작', category:'디자인·콘텐츠', description:'디자인 창작 사진 영상 콘텐츠 Creative design visual content photography filmmaking', keywords:['창작','creative','visual content'] },
  { id:'culture', label:'문화·예술', category:'문화', description:'문화 예술 문학 전시 미술 Culture arts literature exhibitions visual art', keywords:['문화','예술','culture','arts'] },
  { id:'sports', label:'운동·야외 활동', category:'운동', description:'운동 야외 활동 스포츠 체력 달리기 등산 Sports outdoor activities fitness running hiking', keywords:['운동','야외','스포츠','sports','outdoor'] },
];

export const canonicalDemo = (value: string) => value.toLowerCase().replace(/[\s·_\-/]/g,'');
const topicById = new Map(demoTopics.map(topic => [topic.id, topic]));
const topicByName = new Map(demoTopics.map(topic => [canonicalDemo(topic.label), topic]));
const aliases: Record<string,string> = { ai:'ai', 인공지능:'ai', 머신러닝:'ai', 딥러닝:'ai', machinelearning:'ai', deeplearning:'ai', computervision:'vision', 일본음악:'jpop', jpop:'jpop', 일본여행:'japan', 전시:'exhibition', 러닝:'running', 게임:'gaming', ux:'design', ui:'design', 디자인:'design' };
const clamp = (value: number) => Math.max(0,Math.min(100,Number.isFinite(value) ? value : 0));
const mean = (values: number[]) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
const round = (value: number) => Math.round(clamp(value));

type Support = { score: number; interests: DemoInterest[]; parent: boolean; label: string; category: string };
export function prepareDemoProfile(profile: DemoProfile): Map<string,Support> {
  const result = new Map<string,Support>();
  for (const interest of profile.interests) {
    if (!Number.isFinite(interest.score) || interest.score < 25 || !interest.evidence?.some(e=>e.id && (e.text?.trim() || e.title?.trim()))) continue;
    const name = canonicalDemo(interest.label);
    const topic = topicById.get(interest.id) || topicByName.get(name) || topicById.get(aliases[name]);
    const id = topic?.id || `custom:${name}`;
    const put = (key:string, label:string, category:string, score:number, parent:boolean) => {
      const previous=result.get(key);
      if (previous) { previous.score=Math.max(previous.score,score); if (!previous.interests.some(i=>i.id===interest.id && i.label===interest.label)) previous.interests.push(interest); previous.parent=previous.parent && parent; }
      else result.set(key,{score:clamp(score),interests:[interest],parent,label,category});
    };
    put(id,topic?.label || interest.label,topic?.category || interest.category,interest.score,false);
    let parent=topic?.parent, depth=0;
    while (parent && depth++ < 4) {
      const ancestor=topicById.get(parent); if (!ancestor) break;
      put(ancestor.id,ancestor.label,ancestor.category,interest.score * (1-0.08*depth),true);
      parent=ancestor.parent;
    }
  }
  return result;
}

export function validateDemoProfiles(profiles: DemoProfile[], minimum=2) {
  if (!Array.isArray(profiles) || profiles.length < minimum) throw new Error(`${minimum}명 이상의 사용자를 선택해주세요.`);
  if (new Set(profiles.map(p=>p.id)).size !== profiles.length) throw new Error('참가자 ID가 중복되었습니다.');
  if (profiles.some(p=>!p.id || !p.name || !Array.isArray(p.interests))) throw new Error('사용자 관심사 프로필을 확인해주세요.');
}

export function commonInterests(profiles: DemoProfile[]): CommonInterest[] {
  validateDemoProfiles(profiles);
  return commonFromPrepared(profiles, profiles.map(prepareDemoProfile));
}

export function commonFromPrepared(profiles: DemoProfile[], prepared: Map<string,Support>[]): CommonInterest[] {
  const result: CommonInterest[]=[];
  for (const [id,first] of prepared[0] || []) {
    const supports=prepared.map(p=>p.get(id));
    // A topic is only called common when every selected participant has its own evidence.
    if (supports.some(s=>!s)) continue;
    const valid=supports as Support[];
    const memberScores=valid.map(s=>s.score);
    const commonality=round(0.55*Math.min(...memberScores)+0.45*mean(memberScores));
    const evidence=valid.map((support,index)=>{
      const unique=new Map(support.interests.flatMap(i=>i.evidence).filter(e=>e.id && (e.text?.trim() || e.title?.trim())).map(e=>[e.id,e]));
      return {profileId:profiles[index].id,profileName:profiles[index].name,score:round(support.score),interestLabels:[...new Set(support.interests.map(i=>i.label))],sources:[...unique.values()].slice(0,8)};
    });
    const evidenceStrength=round(mean(evidence.map(e=>Math.min(100,55+15*Math.log2(1+e.sources.length)+7*(new Set(e.sources.map(s=>s.source)).size-1)))));
    const matchType=valid.some(s=>s.parent)?'Category':valid.some(s=>s.interests.some(i=>i.matchType==='Semantic'))?'Semantic':'Exact';
    const score=round(commonality*0.75+evidenceStrength*0.25);
    if (score < 30) continue;
    result.push({id,label:first.label,category:first.category,score,members:profiles.map(p=>p.id),evidence,commonality,evidenceStrength,matchType,
      reason:matchType==='Category'?`서로 다른 관심사를 ${first.label} 분야로 연결했으며, 선택한 ${profiles.length}명 모두에게 근거가 있습니다.`:matchType==='Semantic'?`Qwen3가 분석한 ${first.label} 관심사에 선택한 ${profiles.length}명 모두의 데이터가 연결됩니다.`:`선택한 ${profiles.length}명 모두 ${first.label}에 대한 관심사 근거가 있습니다.`});
  }
  // Keep specific topics ahead of a redundant ancestor. Broad topics remain useful when
  // members have different children (e.g. computer vision and data analysis -> AI).
  const specific=result.filter(topic=>!result.some(other=>other.id!==topic.id && isAncestor(topic.id,other.id) && other.score >= topic.score-5));
  return specific.sort((a,b)=>b.score-a.score || a.label.localeCompare(b.label));
}

function isAncestor(parent:string,child:string) {
  let next=topicById.get(child)?.parent,depth=0;
  while(next && depth++<4) { if(next===parent)return true; next=topicById.get(next)?.parent; }
  return false;
}

export function groupQuality(profiles: DemoProfile[], interests=commonInterests(profiles), pairCoverage?:number): DemoGroupQuality {
  const top=interests.slice(0,3);
  const topicStrength=round(mean(top.map(t=>t.score)));
  const contributions=profiles.map(p=>mean(top.map(t=>t.evidence.find(e=>e.profileId===p.id)?.score || 0)));
  const memberBalance=round(mean(contributions)>0 ? 100*Math.min(...contributions)/mean(contributions) : 0);
  const topicBreadth=round(top.length ? Math.min(100,25*new Set(top.map(t=>t.category)).size+8*top.length) : 0);
  let coverage=pairCoverage;
  if (coverage===undefined) { const pairs=profiles.flatMap((a,i)=>profiles.slice(i+1).map(b=>commonInterests([a,b]).some(t=>t.score>=40)?1:0)); coverage=100*mean(pairs); }
  const covered=round(coverage);
  return {topicStrength,memberBalance,topicBreadth,pairCoverage:covered,groupUtility:round(0.45*topicStrength+0.25*memberBalance+0.15*topicBreadth+0.15*covered)};
}

export function expectedTableSizes(count:number,capacity:number) {
  if (![3,4,5].includes(capacity)) throw new Error('테이블당 인원은 3명, 4명, 5명 중 선택해주세요.');
  if (!Number.isInteger(count) || count<3 || count>24) throw new Error('Demo 편성은 3~24명의 참가자를 지원합니다.');
  const tables=Math.ceil(count/capacity),lower=Math.floor(count/tables),upper=Math.ceil(count/tables);
  if(lower<3)throw new Error(`${count}명은 테이블당 최대 ${capacity}명, 최소 3명 조건으로 편성할 수 없습니다. 인원 또는 테이블당 인원을 변경해주세요.`);
  return {tables,lower,upper,smallTables:tables-(count%tables),largeTables:count%tables};
}

const exampleSets = [
  ['ai','jpop','japan','vision','coffee'], ['jpop','japan','concert','language','photo'],
  ['design','exhibition','photo','film','coffee'], ['running','hiking','fitness','coffee','cooking'],
  ['coding','ai','data','gaming','product'], ['product','marketing','design','books','coffee'],
];
const exampleNames=['민수','지은','서준','혜진','지우','민서','준호','수빈','현우','예린','도윤','소연','하늘','지원','태윤','채원','은우','유진','시우','다은','정우','나연','성민','수아'];
const exampleColors=['#557A68','#D59375','#697FA6','#9477A5','#C8A052','#55999A'];
export const demoProfiles: DemoProfile[]=exampleNames.map((name,index)=>({
  id:`demo-${String(index+1).padStart(2,'0')}`,name,color:exampleColors[index%exampleColors.length],isDemo:true,
  interests:exampleSets[Math.floor(index/4)].map((id,rank)=>{
    const topic=topicById.get(id)!;
    return {id,label:topic.label,category:topic.category,score:95-rank*5-(index%4)*2,evidence:[{id:`example-${index}-${id}`,source:'demo' as const,title:`${topic.label} 시현용 예시`,text:`${name}의 ${topic.label} 관심사를 보여주는 예시 데이터입니다. 실제 외부 계정에서 수집한 정보가 아닙니다.`}],matchType:'Category' as const};
  }),
}));
