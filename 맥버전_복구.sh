#!/bin/bash

echo "🚑 맥 버전 긴급 복구 스크립트"
echo "=============================="

cd "/Users/eon/Desktop/testflight/image-overlay"

echo ""
echo "📍 현재 상태 확인..."
echo "작업 디렉토리: $(pwd)"
echo "Git 상태: $(git status --porcelain | wc -l) 개의 변경사항"

echo ""
echo "🧹 캐시 및 빌드 정리..."
rm -rf node_modules
rm -rf dist
rm -rf src-tauri/target
rm -f package-lock.json

echo ""
echo "📦 의존성 재설치..."
npm install

echo ""
echo "🏗️ 프론트엔드 빌드..."
npm run build

echo ""
echo "🔍 빌드 결과 확인..."
if [ -d "dist" ]; then
    echo "✅ 프론트엔드 빌드 성공"
    echo "파일 개수: $(find dist -type f | wc -l)개"
else
    echo "❌ 프론트엔드 빌드 실패"
    exit 1
fi

echo ""
echo "🚀 앱 실행 테스트..."
echo "다음 명령어로 앱을 테스트해보세요:"
echo "  npm run tauri dev"

echo ""
echo "📦 프로덕션 빌드 (선택사항):"
echo "  npm run tauri build"

echo ""
echo "✅ 복구 완료!"
echo "문제가 지속되면 다음을 확인하세요:"
echo "1. Rust 설치: rustc --version"
echo "2. Node.js 버전: node --version"
echo "3. Tauri CLI: npm list @tauri-apps/cli"
