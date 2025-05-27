#!/bin/bash
echo "🚀 Image Overlay Tool v1.4.6 배포 빌드 시작..."
echo "📧 개발자: Eric (eon232@gmail.com)"
echo "📅 빌드 날짜: $(date)"

echo "1️⃣ xwin 설치 확인..."
if ! command -v xwin &> /dev/null; then
  echo "xwin이 설치되지 않았습니다. 설치 중..."
  cargo install xwin
fi

echo "2️⃣ Tauri CLI 업데이트..."
npm install -g @tauri-apps/cli@latest

echo "3️⃣ 윈도우 SDK 다운로드..."
rm -rf $HOME/.xwin
xwin --arch x86_64 --accept-license splat --output $HOME/.xwin

echo "4️⃣ xwin 디렉토리 및 심볼릭 링크 생성..."
mkdir -p $HOME/.xwin/xwin
ln -sf /Users/eon/.rustup/toolchains/stable-aarch64-apple-darwin/lib/rustlib/aarch64-apple-darwin/bin/rust-lld $HOME/.xwin/xwin/lld-link
ln -sf /Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/Clang $HOME/.xwin/xwin/Clang-cl
echo "✅ 심볼릭 링크 생성 완료:"
ls -l $HOME/.xwin/xwin

echo "5️⃣ 라이브러리 경로 확인..."
ls -l $HOME/.xwin/sdk/lib/um/x86_64/advapi32.lib
ls -l $HOME/.xwin/sdk/lib/um/x86_64/kernel32.lib

echo "6️⃣ 의존성 확인 및 설치..."
npm install

echo "7️⃣ 기존 빌드 파일 정리..."
rm -rf src-tauri/target/release/bundle/*

echo "8️⃣ 프론트엔드 빌드 중..."
npm run build

echo "9️⃣ Tauri macOS 빌드 중..."
npm run tauri build
echo "📦 macOS 빌드 완료"

echo "10️⃣ Tauri 윈도우 빌드 중..."
export XWIN_CACHE_DIR=$HOME/.xwin
export CC_x86_64_pc_windows_msvc=$HOME/.xwin/xwin/Clang-cl
export CXX_x86_64_pc_windows_msvc=$HOME/.xwin/xwin/Clang-cl
export LINKER_x86_64_pc_windows_msvc=$HOME/.xwin/xwin/lld-link
export RUSTFLAGS="-Clinker=$HOME/.xwin/xwin/lld-link"
export LIB="$HOME/.xwin/crt/lib/x86_64;$HOME/.xwin/sdk/lib/um/x86_64;$HOME/.xwin/sdk/lib/ucrt/x86_64"
cd src-tauri
cargo xwin build --release --target x86_64-pc-windows-msvc
cd ..
npm run tauri build -- --target x86_64-pc-windows-msvc
echo "📦 윈도우 빌드 완료"

echo "11️⃣ 빌드 결과 확인..."
ls -lh src-tauri/target/release/bundle/
