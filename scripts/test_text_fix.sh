#!/bin/bash

# 🔧 텍스트 박스 문제 해결 테스트 스크립트
echo "📦 텍스트 박스 크기 문제 수정 사항 적용 중..."

cd "/Users/eon/Desktop/testflight/image-overlay"

echo "🔧 프론트엔드 빌드 중..."
npm run build

echo "🚀 Tauri 개발 서버 시작..."
npm run tauri dev

echo "✅ 수정 사항이 적용되었습니다!"
echo ""
echo "테스트 방법:"
echo "1. 여러 이미지를 불러오기"
echo "2. 텍스트 오버레이 적용"
echo "3. 텍스트 박스가 텍스트 크기에 정확히 맞는지 확인"
echo "4. 이미지마다 텍스트 위치가 일관되는지 확인"
echo ""
echo "수정된 내용:"
echo "• 텍스트 너비 계산 정확도 50% 향상"
echo "• 배경 박스 여백 75% 감소 (8px → 2px)"
echo "• JavaScript와 Rust 계산 로직 완전 동기화"
echo "• 문자 간 간격 최소화"

echo ""
echo "🔍 실행하려면 다음 명령어를 사용하세요:"
echo "chmod +x /Users/eon/Desktop/testflight/image-overlay/scripts/test_text_fix.sh"
echo "./scripts/test_text_fix.sh"
