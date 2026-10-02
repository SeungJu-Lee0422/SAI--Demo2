// Explicit presentation fixtures. These are never described as imported account data.
const topics = [
 ['일본 음악','음악',['YOASOBI 플레이리스트','THE FIRST TAKE 감상','Ado 공연 영상']],
 ['AI','공부·일',['Deep Learning 수업','AI 프로젝트','인공지능 연구']],
 ['일본 여행','여행',['Tokyo Travel','교토 여행 기록','오사카 여행 준비']],
 ['라이브 공연','음악',['라이브 공연 감상','음악 페스티벌','콘서트 관람']],
 ['Computer Vision','공부·일',['Computer Vision 프로젝트','영상 인식 연구','이미지 분류 실습']],
 ['전시','콘텐츠',['미술관 전시 관람','현대미술 전시','디자인 전시']],
 ['러닝','운동',['러닝 모임','주말 달리기','러닝 훈련']],
 ['게임','게임',['협동 게임','인디 게임','게임 디자인']],
];
const names=['민수','지은','서준','혜진','지우','민서','준호','수빈','도윤','예린','현우','유진','하린','태윤','소연','성민','지호','나연','은우','다은','시우','채원','건우','수아'];
const themes=[[0,2,3,5],[1,4,7,5],[2,5,6,0],[0,3,7,2],[1,4,6,7],[5,6,2,1]];
export function demoProfiles(){return names.map((name,i)=>({
 id:`demo-${String(i+1).padStart(2,'0')}`,name,color:['#282828','#6C657D','#61736E','#857359'][i%4],isDemo:true,
 interests:themes[Math.floor(i/4)].map((index,j)=>{const [label,category,examples]=topics[index];return{
  id:`demo-${i}-interest-${index}`,label,category,score:90-j*6-(i%4)*2,
  evidence:[{id:`demo-evidence-${i}-${index}`,source:'demo',title:examples[i%examples.length],text:`기획안 시연용 예시 데이터 · ${name} · ${label} · ${examples[i%examples.length]}`}],
 };}),
}));}
