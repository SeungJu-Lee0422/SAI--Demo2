import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const python=process.env.SAI_SETUP_PYTHON||'python3';
await mkdir(new URL('../.data/',import.meta.url),{recursive:true});
const venv=spawnSync(python,['-m','venv','--without-pip','.data/solver-env'],{cwd:root,stdio:'inherit'});
if(venv.status!==0)process.exit(venv.status||1);
const response=await fetch('https://bootstrap.pypa.io/pip/pip.pyz');
if(!response.ok)throw new Error('공식 pip 도구를 다운로드하지 못했습니다.');
await writeFile(new URL('../.data/pip.pyz',import.meta.url),Buffer.from(await response.arrayBuffer()));
const executable=process.platform==='win32'?'.data/solver-env/Scripts/python.exe':'.data/solver-env/bin/python';
const result=spawnSync(executable,['.data/pip.pyz','install','--cache-dir','.data/pip-cache','-r','backend/requirements.txt'],{cwd:root,stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
console.log('SAI 전용 CP-SAT 실행 환경 준비 완료');
