#!/usr/bin/env node
/**
 * 성경 66권 전체를 5장씩 묶어 .txt 파일로 저장하는 스크립트
 *
 * 구조:
 *   output/
 *   ├── Genesis/
 *   │   ├── 창세기1-5장.txt
 *   │   ├── 창세기6-10장.txt
 *   │   └── ...
 *   ├── Exodus/
 *   │   ├── 출애굽기1-5장.txt
 *   │   └── ...
 *   └── ...
 *
 * 데이터 출처: getBible API v2 (https://api.getbible.net/v2/)
 * 번역본: 개역성경 (Korean Revised Version 1952/1961, Public Domain)
 *
 * 사용법:
 *   node download-bible.js              # 전체 66권 다운로드
 *   node download-bible.js 1            # 1번 책(창세기)만 다운로드
 *   node download-bible.js 1 5          # 1~5번 책만 다운로드
 *   node download-bible.js 40 66        # 신약 전체(40~66번)만 다운로드
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ─────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────
const TRANSLATION = 'korean';   // 개역성경 (Public Domain)
const CHAPTERS_PER_FILE = 5;
const OUTPUT_DIR = path.join(__dirname, 'output');
const REQUEST_DELAY_MS = 150;   // 서버 부하 방지용 딜레이
const MAX_RETRIES = 3;          // 실패 시 재시도 횟수

// ─────────────────────────────────────────────
// 성경 66권 데이터: [번호, 영문명(디렉토리용), 한글명(파일용), 장 수]
// ─────────────────────────────────────────────
const BIBLE_BOOKS = [
  // 구약 (Old Testament) - 39권
  [ 1, 'Genesis',         '창세기',     50],
  [ 2, 'Exodus',          '출애굽기',   40],
  [ 3, 'Leviticus',       '레위기',     27],
  [ 4, 'Numbers',         '민수기',     36],
  [ 5, 'Deuteronomy',     '신명기',     34],
  [ 6, 'Joshua',          '여호수아',   24],
  [ 7, 'Judges',          '사사기',     21],
  [ 8, 'Ruth',            '룻기',        4],
  [ 9, '1Samuel',         '사무엘상',   31],
  [10, '2Samuel',         '사무엘하',   24],
  [11, '1Kings',          '열왕기상',   22],
  [12, '2Kings',          '열왕기하',   25],
  [13, '1Chronicles',     '역대상',     29],
  [14, '2Chronicles',     '역대하',     36],
  [15, 'Ezra',            '에스라',     10],
  [16, 'Nehemiah',        '느헤미야',   13],
  [17, 'Esther',          '에스더',     10],
  [18, 'Job',             '욥기',       42],
  [19, 'Psalms',          '시편',      150],
  [20, 'Proverbs',        '잠언',       31],
  [21, 'Ecclesiastes',    '전도서',     12],
  [22, 'SongOfSolomon',   '아가',        8],
  [23, 'Isaiah',          '이사야',     66],
  [24, 'Jeremiah',        '예레미야',   52],
  [25, 'Lamentations',    '예레미야애가', 5],
  [26, 'Ezekiel',         '에스겔',     48],
  [27, 'Daniel',          '다니엘',     12],
  [28, 'Hosea',           '호세아',     14],
  [29, 'Joel',            '요엘',        3],
  [30, 'Amos',            '아모스',      9],
  [31, 'Obadiah',         '오바댜',      1],
  [32, 'Jonah',           '요나',        4],
  [33, 'Micah',           '미가',        7],
  [34, 'Nahum',           '나훔',        3],
  [35, 'Habakkuk',        '하박국',      3],
  [36, 'Zephaniah',       '스바냐',      3],
  [37, 'Haggai',          '학개',        2],
  [38, 'Zechariah',       '스가랴',     14],
  [39, 'Malachi',         '말라기',      4],
  // 신약 (New Testament) - 27권
  [40, 'Matthew',         '마태복음',   28],
  [41, 'Mark',            '마가복음',   16],
  [42, 'Luke',            '누가복음',   24],
  [43, 'John',            '요한복음',   21],
  [44, 'Acts',            '사도행전',   28],
  [45, 'Romans',          '로마서',     16],
  [46, '1Corinthians',    '고린도전서', 16],
  [47, '2Corinthians',    '고린도후서', 13],
  [48, 'Galatians',       '갈라디아서',  6],
  [49, 'Ephesians',       '에베소서',    6],
  [50, 'Philippians',     '빌립보서',    4],
  [51, 'Colossians',      '골로새서',    4],
  [52, '1Thessalonians',  '데살로니가전서', 5],
  [53, '2Thessalonians',  '데살로니가후서', 3],
  [54, '1Timothy',        '디모데전서',  6],
  [55, '2Timothy',        '디모데후서',  4],
  [56, 'Titus',           '디도서',      3],
  [57, 'Philemon',        '빌레몬서',    1],
  [58, 'Hebrews',         '히브리서',   13],
  [59, 'James',           '야고보서',    5],
  [60, '1Peter',          '베드로전서',  5],
  [61, '2Peter',          '베드로후서',  3],
  [62, '1John',           '요한1서',     5],
  [63, '2John',           '요한2서',     1],
  [64, '3John',           '요한3서',     1],
  [65, 'Jude',            '유다서',      1],
  [66, 'Revelation',      '요한계시록', 22],
];

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
 * 재시도 로직이 포함된 fetch. 일시적 네트워크 오류에 대비.
 */
async function fetchJsonWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetchJson(url);
    } catch (err) {
      if (attempt === retries) throw err;
      const backoff = 1000 * attempt;
      console.log(`    ⚠️  재시도 ${attempt}/${retries} (${backoff}ms 후): ${err.message}`);
      await sleep(backoff);
    }
  }
}

/**
 * 지정한 책/장의 본문을 가져와서 "1 본문...\n2 본문..." 형태의 문자열로 반환.
 */
async function fetchChapter(bookNr, chapterNr) {
  const url = `https://api.getbible.net/v2/${TRANSLATION}/${bookNr}/${chapterNr}.json`;
  const data = await fetchJsonWithRetry(url);

  if (!data.verses || !Array.isArray(data.verses)) {
    throw new Error(`Unexpected response shape for book ${bookNr} chapter ${chapterNr}`);
  }

  // 절 번호 순으로 정렬
  const verses = [...data.verses].sort((a, b) => a.verse - b.verse);

  return verses
    .map(v => `${v.verse} ${String(v.text).trim()}`)
    .join('\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 한 권의 책을 모두 다운로드하여 5장씩 파일로 저장
 */
async function downloadBook(book) {
  const [bookNr, engName, korName, totalChapters] = book;

  // 책별 디렉토리 생성 (영문명)
  const bookDir = path.join(OUTPUT_DIR, engName);
  if (!fs.existsSync(bookDir)) {
    fs.mkdirSync(bookDir, { recursive: true });
  }

  const fileCount = Math.ceil(totalChapters / CHAPTERS_PER_FILE);
  console.log(`\n📖 [${bookNr}/66] ${korName} (${engName}) - ${totalChapters}장 → ${fileCount}개 파일`);

  for (let start = 1; start <= totalChapters; start += CHAPTERS_PER_FILE) {
    const end = Math.min(start + CHAPTERS_PER_FILE - 1, totalChapters);
    const sections = [];

    for (let ch = start; ch <= end; ch++) {
      process.stdout.write(`    ⬇️  ${ch}장... `);
      const body = await fetchChapter(bookNr, ch);
      sections.push(`【 ${korName} ${ch}장 】\n\n${body}`);
      process.stdout.write('✓ ');
      await sleep(REQUEST_DELAY_MS);
    }

    // 1장짜리 책은 "유다서1장.txt" 형식, 여러 장은 "창세기1-5장.txt"
    const fileName = (start === end)
      ? `${korName}${start}장.txt`
      : `${korName}${start}-${end}장.txt`;
    const filePath = path.join(bookDir, fileName);
    const content = sections.join('\n\n' + '─'.repeat(40) + '\n\n') + '\n';

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`\n    ✅ ${fileName}`);
  }
}

// ─────────────────────────────────────────────
// 메인 로직
// ─────────────────────────────────────────────
async function main() {
  // 커맨드라인 인자로 범위 지정 가능
  const args = process.argv.slice(2);
  const startBook = args[0] ? parseInt(args[0], 10) : 1;
  const endBook   = args[1] ? parseInt(args[1], 10) : (args[0] ? startBook : 66);

  if (isNaN(startBook) || isNaN(endBook) || startBook < 1 || endBook > 66 || startBook > endBook) {
    console.error('❌ 잘못된 범위입니다. 사용법:');
    console.error('   node download-bible.js              # 전체 66권');
    console.error('   node download-bible.js 1            # 1번 책만');
    console.error('   node download-bible.js 1 5          # 1~5번 책');
    console.error('   node download-bible.js 40 66        # 신약 전체');
    process.exit(1);
  }

  const booksToDownload = BIBLE_BOOKS.filter(([nr]) => nr >= startBook && nr <= endBook);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const startTime = Date.now();
  console.log('═'.repeat(60));
  console.log(`📚 성경 다운로드 시작 (${startBook}번 ~ ${endBook}번, 총 ${booksToDownload.length}권)`);
  console.log(`📂 출력 위치: ${OUTPUT_DIR}`);
  console.log(`🌐 번역본: 개역성경(1961, Public Domain) via getBible API`);
  console.log('═'.repeat(60));

  let totalFiles = 0;
  let totalChapters = 0;
  const failedBooks = [];

  for (const book of booksToDownload) {
    try {
      await downloadBook(book);
      totalFiles += Math.ceil(book[3] / CHAPTERS_PER_FILE);
      totalChapters += book[3];
    } catch (err) {
      console.error(`\n❌ ${book[2]} (${book[1]}) 다운로드 실패: ${err.message}`);
      failedBooks.push(book);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(60));
  console.log(`🎉 다운로드 완료!`);
  console.log(`   - 총 ${booksToDownload.length - failedBooks.length}권 / ${totalChapters}장 / ${totalFiles}개 파일`);
  console.log(`   - 소요 시간: ${elapsed}초`);
  if (failedBooks.length > 0) {
    console.log(`   - ⚠️  실패: ${failedBooks.map(b => b[2]).join(', ')}`);
  }
  console.log('═'.repeat(60));
  console.log('\n📝 참고: 본 텍스트는 공개 도메인 "개역성경(1952/1961)"입니다.');
  console.log('   출처: getBible API (https://api.getbible.net)\n');
}

main().catch(err => {
  console.error('\n❌ 치명적 오류:', err.message);
  process.exit(1);
});
