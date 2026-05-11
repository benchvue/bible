#!/usr/bin/env node
/**
 * 창세기 1~50장을 5장씩 묶어 10개의 .txt 파일로 저장하는 스크립트
 *
 * 데이터 출처: getBible API v2 (https://api.getbible.net/v2/)
 * 번역본: 개역성경 (Korean Revised Version 1952/1961, Public Domain)
 *
 * 사용법:
 *   node download-genesis.js
 *
 * 출력:
 *   ./output/창세기1-5장.txt
 *   ./output/창세기6-10장.txt
 *   ...
 *   ./output/창세기46-50장.txt
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ─────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────
const TRANSLATION = 'korean';   // 개역성경 (Public Domain)
const BOOK_NUMBER = 1;          // 창세기
const BOOK_NAME = '창세기';
const TOTAL_CHAPTERS = 50;
const CHAPTERS_PER_FILE = 5;
const OUTPUT_DIR = path.join(__dirname, 'output');
const REQUEST_DELAY_MS = 200;   // 서버 부하 방지용 딜레이

// ─────────────────────────────────────────────
// 유틸 함수
// ─────────────────────────────────────────────

/**
 * https.get을 Promise로 감싸기. JSON 응답을 파싱해서 반환.
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`JSON parse error for ${url}: ${err.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * 지정한 책/장의 본문을 가져와서 "1 본문...\n2 본문..." 형태의 문자열로 반환.
 */
async function fetchChapter(bookNr, chapterNr) {
  const url = `https://api.getbible.net/v2/${TRANSLATION}/${bookNr}/${chapterNr}.json`;
  const data = await fetchJson(url);

  if (!data.verses || !Array.isArray(data.verses)) {
    throw new Error(`Unexpected response shape for ${BOOK_NAME} ${chapterNr}`);
  }

  // 절 번호 순으로 정렬 (혹시 모를 안전장치)
  const verses = [...data.verses].sort((a, b) => a.verse - b.verse);

  return verses
    .map(v => `${v.verse} ${String(v.text).trim()}`)
    .join('\n');
}

/**
 * 잠시 대기 (rate limit 방지)
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
// 메인 로직
// ─────────────────────────────────────────────
async function main() {
  // 출력 폴더 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`📖 ${BOOK_NAME} ${TOTAL_CHAPTERS}장을 ${CHAPTERS_PER_FILE}장씩 ${TOTAL_CHAPTERS / CHAPTERS_PER_FILE}개 파일로 저장합니다.`);
  console.log(`📂 출력 위치: ${OUTPUT_DIR}\n`);

  // 5장씩 묶어서 처리
  for (let start = 1; start <= TOTAL_CHAPTERS; start += CHAPTERS_PER_FILE) {
    const end = Math.min(start + CHAPTERS_PER_FILE - 1, TOTAL_CHAPTERS);
    const sections = [];

    for (let ch = start; ch <= end; ch++) {
      process.stdout.write(`  ⬇️  ${BOOK_NAME} ${ch}장 가져오는 중... `);
      try {
        const body = await fetchChapter(BOOK_NUMBER, ch);
        sections.push(`【 ${BOOK_NAME} ${ch}장 】\n\n${body}`);
        console.log('✓');
      } catch (err) {
        console.log(`✗ (${err.message})`);
        throw err;
      }
      // 서버 부담을 줄이기 위해 짧은 딜레이
      await sleep(REQUEST_DELAY_MS);
    }

    const fileName = `${BOOK_NAME}${start}-${end}장.txt`;
    const filePath = path.join(OUTPUT_DIR, fileName);
    const content = sections.join('\n\n' + '─'.repeat(40) + '\n\n') + '\n';

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ 저장 완료: ${fileName}\n`);
  }

  console.log('🎉 모든 파일을 성공적으로 저장했습니다!');
  console.log(`\n참고: 본 텍스트는 공개 도메인 "개역성경(1952/1961)"이며, getBible API(https://api.getbible.net)를 통해 받았습니다.`);
}

main().catch(err => {
  console.error('\n❌ 오류 발생:', err.message);
  process.exit(1);
});
