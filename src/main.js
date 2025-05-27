import { dialog, invoke } from '@tauri-apps/api';

// 비밀번호 생성 및 검증 클래스
class PasswordManager {
  constructor() {
    this.secretSeed = 'Eric2025ImageOverlay'; // 비밀 시드값
  }

  // 월별 비밀번호 생성
  generateMonthlyPassword(year, month) {
    const dateString = `${year}-${month.toString().padStart(2, '0')}`;
    const combined = `${dateString}_${this.secretSeed}`;
    
    // 간단한 해시 알고리즘 (Eric이 계산할 수 있도록)
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32비트 정수로 변환
    }
    
    // 해시값을 8자리 문자열로 변환
    const passwordNum = Math.abs(hash) % 100000000;
    return passwordNum.toString().padStart(8, '0');
  }

  // 현재 달 비밀번호 가져오기
  getCurrentMonthPassword() {
    const now = new Date();
    return this.generateMonthlyPassword(now.getFullYear(), now.getMonth() + 1);
  }

  // 비밀번호 검증
  validatePassword(inputPassword) {
    const currentPassword = this.getCurrentMonthPassword();
    return inputPassword === currentPassword;
  }

  // 다음 달 비밀번호 미리 보기 (Eric용)
  getNextMonthPassword() {
    const now = new Date();
    let nextMonth = now.getMonth() + 2; // +1은 현재 달, +2는 다음 달
    let nextYear = now.getFullYear();
    
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }
    
    return this.generateMonthlyPassword(nextYear, nextMonth);
  }
}

// 로그인 관리 클래스
class LoginManager {
  constructor() {
    this.passwordManager = new PasswordManager();
    this.isLoggedIn = false;
    this.initializeElements();
    this.attachEventListeners();
    this.checkMonthlyAuth(); // 월별 인증 확인
  }

  initializeElements() {
    this.loginScreen = document.getElementById('loginScreen');
    this.mainScreen = document.getElementById('mainScreen');
    this.passwordInput = document.getElementById('passwordInput');
    this.loginBtn = document.getElementById('loginBtn');
    this.loginError = document.getElementById('loginError');
    this.logoutBtn = document.getElementById('logoutBtn');
  }

  // 월별 인증 상태 확인
  checkMonthlyAuth() {
    try {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
      
      // 로컬 저장소에서 인증된 월 확인
      const authMonth = localStorage.getItem('imageOverlayAuthMonth');
      
      if (authMonth === currentMonth) {
        // 이번 달 이미 인증됨 - 바로 메인 화면
        this.isLoggedIn = true;
        this.showMainScreen();
        console.log('이번 달 이미 인증됨 - 자동 로그인');
      } else {
        // 새로운 달이거나 처음 실행 - 로그인 필요
        this.showLoginScreen();
        console.log('새로운 달 또는 처음 실행 - 로그인 필요');
      }
    } catch (error) {
      console.error('월별 인증 확인 오류:', error);
      // 오류 시 안전하게 로그인 화면 표시
      this.showLoginScreen();
    }
  }

  attachEventListeners() {
    this.loginBtn.addEventListener('click', () => this.handleLogin());
    this.logoutBtn.addEventListener('click', () => this.handleLogout());
    
    // Enter 키로 로그인
    this.passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleLogin();
      }
    });
  }

  handleLogin() {
    const inputPassword = this.passwordInput.value.trim();
    
    if (!inputPassword) {
      this.showError('비밀번호를 입력해주세요.');
      return;
    }

    if (this.passwordManager.validatePassword(inputPassword)) {
      this.isLoggedIn = true;
      
      // 현재 월 인증 정보 저장
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
      
      try {
        localStorage.setItem('imageOverlayAuthMonth', currentMonth);
        console.log('월별 인증 정보 저장:', currentMonth);
      } catch (error) {
        console.error('인증 정보 저장 오류:', error);
        // 저장 실패해도 로그인은 진행
      }
      
      this.showMainScreen();
      this.showSuccessMessage('로그인 성공! 이번 달 동안 재로그인이 필요하지 않습니다.');
    } else {
      this.showError('잘못된 비밀번호입니다. 비밀번호는 매달 갱신됩니다.');
      this.passwordInput.value = '';
    }
  }

  handleLogout() {
    this.isLoggedIn = false;
    
    // 인증 정보 삭제
    try {
      localStorage.removeItem('imageOverlayAuthMonth');
      console.log('인증 정보 삭제됨');
    } catch (error) {
      console.error('인증 정보 삭제 오류:', error);
    }
    
    this.showLoginScreen();
    this.passwordInput.value = '';
    this.clearError();
  }

  showLoginScreen() {
    this.loginScreen.style.display = 'block';
    this.mainScreen.style.display = 'none';
    this.passwordInput.focus();
  }

  showMainScreen() {
    this.loginScreen.style.display = 'none';
    this.mainScreen.style.display = 'block';
  }

  showError(message) {
    this.loginError.textContent = message;
    this.loginError.style.color = '#e74c3c';
  }

  showSuccessMessage(message) {
    this.loginError.textContent = message;
    this.loginError.style.color = '#2ecc71';
  }

  clearError() {
    this.loginError.textContent = '';
  }

  // 로그인 상태 확인
  checkLoginStatus() {
    return this.isLoggedIn;
  }
}

class ImageOverlayApp {
  constructor() {
    this.inputPath = '';
    this.outputPath = '';
    this.images = [];
    this.isBatchMode = true;
    this.isAutoText = true;
    this.selectedImageIndex = 0;
    this.selectedImageIndexForPreview = 0; // 개별 미리보기용 인덱스
    this.currentSettings = {
      fontSize: 20,
      positionX: 10, // 🔧 우측에서 10% 떨어진 위치
      positionY: 10, // 🔧 하단에서 10% 떨어진 위치
      text: ''
    };
    
    // 성능 최적화를 위한 개선된 디바운싱 (더 짧은 지연시간)
    this.updatePreviewDebounced = this.debounce(this.updatePreview.bind(this), 150); // 300ms -> 150ms
    this.updateIndividualPreviewDebounced = this.debounce(this.updateIndividualPreview.bind(this), 150);
    
    // 미리보기 캐싱 추가
    this.previewCache = new Map();
    this.cacheMaxSize = 20;
    
    // 전체 선택 상태 추적
    this.isUpdatingSelectAll = false;
    
    // 알림 타이머 추가
    this.notificationTimer = null;

    // 로그인 관리자 초기화
    this.loginManager = new LoginManager();
    
    this.initializeElements();
    this.attachEventListeners();
    
    // 로그인 성공 후에만 초기화 메시지 표시
    if (this.loginManager.checkLoginStatus()) {
      this.showNotification('프로그램이 초기화되었습니다.', 'success');
    }
  }

  initializeElements() {
    // 폴더 선택 버튼
    this.inputFolderBtn = document.getElementById('inputFolderBtn');
    this.outputFolderBtn = document.getElementById('outputFolderBtn');
    this.inputFolderPath = document.getElementById('inputFolderPath');
    this.outputFolderPath = document.getElementById('outputFolderPath');

    // 모드 토글 버튼
    this.toggleBatchBtn = document.getElementById('toggleBatchBtn');
    this.toggleIndividualBtn = document.getElementById('toggleIndividualBtn');
    this.startBtn = document.getElementById('startBtn');

    // 일괄 처리 모달 요소들
    this.batchModal = document.getElementById('batchModal');
    this.closeBatchModal = document.getElementById('closeBatchModal');
    this.toggleAutoTextBtn = document.getElementById('toggleAutoTextBtn');
    this.toggleCustomTextBtn = document.getElementById('toggleCustomTextBtn');
    this.customTextGroup = document.getElementById('customTextGroup');
    this.customText = document.getElementById('customText');
    
    // 일괄 처리 슬라이더 요소들
    this.fontSize = document.getElementById('fontSize');
    this.fontSizeValue = document.getElementById('fontSizeValue');
    this.positionX = document.getElementById('positionX');
    this.posXValue = document.getElementById('posXValue');
    this.positionY = document.getElementById('positionY');
    this.posYValue = document.getElementById('posYValue');

    // 미리보기 요소들
    this.previewImage = document.getElementById('previewImage');
    this.thumbnailsContainer = document.getElementById('thumbnailsContainer');
    
    // 일괄 처리 버튼들
    this.cancelBatchBtn = document.getElementById('cancelBatchBtn');
    this.saveBatchBtn = document.getElementById('saveBatchBtn');

    // 개별 처리 모달 요소들
    this.individualModal = document.getElementById('individualModal');
    this.closeIndividualModal = document.getElementById('closeIndividualModal');
    
    // 개별 처리 슬라이더 요소들
    this.indFontSize = document.getElementById('indFontSize');
    this.indFontSizeValue = document.getElementById('indFontSizeValue');
    this.indPositionX = document.getElementById('indPositionX');
    this.indPosXValue = document.getElementById('indPosXValue');
    this.indPositionY = document.getElementById('indPositionY');
    this.indPosYValue = document.getElementById('indPosYValue');

    this.indPreviewImage = document.getElementById('indPreviewImage');
    this.individualImageContainer = document.getElementById('individualImageContainer');
    
    // 개별 처리 버튼들
    this.cancelIndividualBtn = document.getElementById('cancelIndividualBtn');
    this.saveIndividualBtn = document.getElementById('saveIndividualBtn');

    // 로그 모달 요소들
    this.logModal = document.getElementById('logModal');
    this.closeLogModal = document.getElementById('closeLogModal');
    this.logContent = document.getElementById('logContent');
    this.confirmLogBtn = document.getElementById('confirmLogBtn');

    // 알림 요소
    this.notification = document.getElementById('notification');

    // 🔧 초기값을 우측/하단 에서의 거리로 설정
    this.positionX.value = 10; // 우측에서 10% 떨어진 위치
    this.posXValue.textContent = '10'; // 우측에서 10%
    this.positionY.value = 10; // 하단에서 10% 떨어진 위치
    this.posYValue.textContent = '10'; // 하단에서 10%
    
    this.indPositionX.value = 10;
    this.indPosXValue.textContent = '10'; // 우측에서 10%
    this.indPositionY.value = 10; // 하단에서 10% 떨어진 위치
    this.indPosYValue.textContent = '10'; // 하단에서 10%
  }

  // 파일명에서 확장자 제거 함수
  removeFileExtension(filename) {
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return filename; // 확장자가 없는 경우 원본 반환
    }
    return filename.substring(0, lastDotIndex);
  }

  // 🔧 한글 텍스트 정규화 함수 (자음/모음 분리 방지)
  normalizeKoreanText(text) {
    if (!text) return text;
    
    try {
      // Unicode 정규화 (NFC: Canonical Decomposition, followed by Canonical Composition)
      // 자음/모음이 분리된 상태를 완성형 한글로 조합
      const normalized = text.normalize('NFC');
      
      // 추가 정리: 비인쇄가능 문자 제거
      const cleaned = normalized.replace(/[\u200B-\u200D\uFEFF]/g, ''); // Zero-width characters 제거
      
      console.log(`한글 정규화: "${text}" -> "${cleaned}"`);
      return cleaned;
    } catch (error) {
      console.warn('한글 정규화 실패:', error);
      return text; // 실패 시 원본 반환
    }
  }

  // 미리보기 캐시 관리
  getCacheKey(imagePath, text, fontSize, posX, posY) {
    return `${imagePath}_${text}_${fontSize}_${posX}_${posY}`;
  }

  addToCache(key, data) {
    if (this.previewCache.size >= this.cacheMaxSize) {
      // 가장 오래된 항목 제거
      const firstKey = this.previewCache.keys().next().value;
      this.previewCache.delete(firstKey);
    }
    this.previewCache.set(key, data);
  }

  getFromCache(key) {
    return this.previewCache.get(key);
  }

  clearCache() {
    this.previewCache.clear();
  }

  // 디바운싱 함수 (성능 최적화)
  debounce(func, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  // 🔧 체크박스 버그 수정: 간단하고 확실한 방법으로 재구현
  updateImageSelection(index, selected) {
    console.log(`이미지 선택 상태 업데이트: ${this.images[index].name} -> ${selected}`);
    
    // 이미지 객체의 선택 상태 업데이트
    this.images[index].selected = selected;
    
    // DOM 요소들 찾기 (더 간단한 선택자 사용)
    const container = document.querySelector(`[data-container-index="${index}"]`);
    if (!container) {
      console.error(`컨테이너를 찾을 수 없습니다: index ${index}`);
      return;
    }
    
    const checkbox = container.querySelector('input[type="checkbox"]');
    const thumbnailImg = container.querySelector('img');
    const textInput = container.querySelector('input[type="text"]');
    const nameDiv = container.querySelector('[data-filename-display]');
    
    // 체크박스 상태 강제 업데이트
    if (checkbox) {
      checkbox.checked = selected;
    }
    
    // 컨테이너 스타일 업데이트
    container.style.border = selected ? '2px solid #dc3545' : '1px solid #dee2e6';
    container.style.backgroundColor = selected ? '#fff5f5' : '#ffffff';
    
    // 썸네일 이미지 보호
    if (thumbnailImg && this.images[index].thumbnailData) {
      thumbnailImg.src = this.images[index].thumbnailData;
      thumbnailImg.style.display = 'block';
      thumbnailImg.style.opacity = selected ? '1' : '0.6';
    }
    
    // 파일명 표시 업데이트
    if (nameDiv) {
      nameDiv.style.color = selected ? '#dc3545' : '#333';
      nameDiv.style.fontWeight = selected ? 'bold' : 'normal';
      nameDiv.textContent = `${selected ? '✅ ' : '❌ '}${this.images[index].name}`;
    }
    
    // 텍스트 입력창 상태 업데이트
    if (textInput) {
      textInput.disabled = !selected;
      textInput.style.border = `1px solid ${selected ? '#dc3545' : '#ccc'}`;
      textInput.style.backgroundColor = selected ? '#ffffff' : '#f8f9fa';
    }
  }

  // 🔧 개선된 전체 선택 라벨 업데이트 함수 (이벤트 리스너 보호)
  updateSelectAllLabel() {
    if (this.isUpdatingSelectAll) return; // 중복 업데이트 방지
    
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (!selectAllCheckbox) return;
    
    const selectedCount = this.images.filter(img => img.selected).length;
    const totalCount = this.images.length;
    
    this.isUpdatingSelectAll = true;
    
    // 체크박스 상태 업데이트
    selectAllCheckbox.checked = selectedCount === totalCount;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalCount;
    
    // 라벨 텍스트 안전하게 업데이트 (기존 이벤트 리스너 보호)
    const label = selectAllCheckbox.closest('label');
    if (label) {
      // 텍스트 노드만 찾아서 업데이트
      const textNodes = Array.from(label.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
      if (textNodes.length > 0) {
        textNodes[0].textContent = ` 전체 선택 (선택됨: ${selectedCount}/${totalCount})`;
      } else {
        // 텍스트 노드가 없는 경우에만 새로 생성
        const textNode = document.createTextNode(` 전체 선택 (선택됨: ${selectedCount}/${totalCount})`);
        label.appendChild(textNode);
      }
    }
    
    this.isUpdatingSelectAll = false;
    
    console.log(`전체 선택 라벨 업데이트: ${selectedCount}/${totalCount}개 선택됨`);
  }

  // 🔧 개선된 전체 선택 변경 핸들러
  handleSelectAllChange(e) {
    if (this.isUpdatingSelectAll) {
      console.log('전체 선택 업데이트 중... 무시');
      return;
    }
    
    const isChecked = e.target.checked;
    console.log(`전체 선택 변경 시작: ${isChecked}`);
    
    // 모든 이미지에 대해 선택 상태 업데이트
    this.images.forEach((image, index) => {
      this.updateImageSelection(index, isChecked);
    });
    
    // 미리보기 업데이트
    this.updateIndividualPreviewDebounced();
    
    console.log(`전체 선택 변경 완료: ${this.images.filter(img => img.selected).length}/${this.images.length}개 선택됨`);
  }

  attachEventListeners() {
    // 폴더 선택 이벤트
    this.inputFolderBtn.addEventListener('click', () => this.selectInputFolder());
    this.outputFolderBtn.addEventListener('click', () => this.selectOutputFolder());

    // 모드 토글 이벤트
    this.toggleBatchBtn.addEventListener('click', () => this.toggleMode(true));
    this.toggleIndividualBtn.addEventListener('click', () => this.toggleMode(false));

    // 시작 버튼 이벤트
    this.startBtn.addEventListener('click', () => this.startProcessing());

    // 일괄 처리 모달 이벤트
    this.closeBatchModal.addEventListener('click', () => this.closeBatchModalHandler());
    this.toggleAutoTextBtn.addEventListener('click', () => this.toggleTextMode(true));
    this.toggleCustomTextBtn.addEventListener('click', () => this.toggleTextMode(false));

    // 일괄 처리 슬라이더 이벤트
    this.fontSize.addEventListener('input', (e) => {
      this.fontSizeValue.textContent = e.target.value;
      this.currentSettings.fontSize = parseInt(e.target.value);
      this.updatePreviewDebounced(); // 디바운싱 사용
    });

    this.positionX.addEventListener('input', (e) => {
      // 🔧 수정: 슬라이더 값을 그대로 사용 (우측에서의 거리)
      this.posXValue.textContent = e.target.value; // 우측에서 e.target.value% 떨어진 지점
      this.currentSettings.positionX = parseInt(e.target.value);
      this.updatePreviewDebounced(); // 디바운싱 사용
    });

    this.positionY.addEventListener('input', (e) => {
      // 🔧 수정: 슬라이더 값을 그대로 사용 (하단에서의 거리)
      this.posYValue.textContent = e.target.value; // 하단에서 e.target.value% 떨어진 지점
      this.currentSettings.positionY = parseInt(e.target.value);
      this.updatePreviewDebounced(); // 디바운싱 사용
    });

    // 일괄 처리 버튼 이벤트
    this.cancelBatchBtn.addEventListener('click', () => this.closeBatchModalHandler());
    this.saveBatchBtn.addEventListener('click', () => this.processBatchImages());

    // 개별 처리 모달 이벤트
    this.closeIndividualModal.addEventListener('click', () => this.closeIndividualModalHandler());

    // 개별 처리 슬라이더 이벤트
    this.indFontSize.addEventListener('input', (e) => {
      this.indFontSizeValue.textContent = e.target.value;
      this.updateIndividualPreviewDebounced(); // 디바운싱 사용
    });

    this.indPositionX.addEventListener('input', (e) => {
      // 🔧 수정: 슬라이더 값을 그대로 사용 (우측에서의 거리)
      this.indPosXValue.textContent = e.target.value; // 우측에서 e.target.value% 떨어진 지점
      this.updateIndividualPreviewDebounced(); // 디바운싱 사용
    });

    this.indPositionY.addEventListener('input', (e) => {
      // 🔧 수정: 슬라이더 값을 그대로 사용 (하단에서의 거리)
      this.indPosYValue.textContent = e.target.value; // 하단에서 e.target.value% 떨어진 지점
      this.updateIndividualPreviewDebounced(); // 디바운싱 사용
    });

    // 개별 처리 버튼 이벤트
    this.cancelIndividualBtn.addEventListener('click', () => this.closeIndividualModalHandler());
    this.saveIndividualBtn.addEventListener('click', () => this.processIndividualImages());

    // 로그 모달 이벤트
    this.closeLogModal.addEventListener('click', () => this.closeLogModalHandler());
    this.confirmLogBtn.addEventListener('click', () => this.closeLogModalHandler());

    // 커스텀 텍스트 입력 이벤트 (한글 정규화 추가)
    this.customText.addEventListener('input', (e) => {
      // 🔧 입력된 텍스트 정규화
      const normalizedText = this.normalizeKoreanText(e.target.value);
      if (normalizedText !== e.target.value) {
        const selectionStart = e.target.selectionStart;
        const selectionEnd = e.target.selectionEnd;
        e.target.value = normalizedText;
        e.target.setSelectionRange(selectionStart, selectionEnd);
      }
      this.updatePreviewDebounced(); // 디바운싱 사용
    });

    // 모달 외부 클릭 시 닫기
    window.addEventListener('click', (e) => {
      if (e.target === this.batchModal) this.closeBatchModalHandler();
      if (e.target === this.individualModal) this.closeIndividualModalHandler();
      if (e.target === this.logModal) this.closeLogModalHandler();
    });
  }

  async selectInputFolder() {
    if (!this.loginManager.checkLoginStatus()) {
      this.showNotification('로그인이 필요합니다.', 'error');
      return;
    }
    
    try {
      const result = await dialog.open({
        directory: true,
        multiple: false,
        title: '입력 폴더 선택'
      });

      if (result) {
        this.inputPath = result;
        this.inputFolderPath.textContent = result;
        this.showNotification('입력 폴더가 선택되었습니다.', 'success');
        await this.loadImages();
      }
    } catch (error) {
      console.error('입력 폴더 선택 오류:', error);
      this.showNotification('폴더 선택 중 오류가 발생했습니다.', 'error');
    }
  }

  async selectOutputFolder() {
    if (!this.loginManager.checkLoginStatus()) {
      this.showNotification('로그인이 필요합니다.', 'error');
      return;
    }
    
    try {
      const result = await dialog.open({
        directory: true,
        multiple: false,
        title: '출력 폴더 선택'
      });

      if (result) {
        this.outputPath = result;
        this.outputFolderPath.textContent = result;
        this.showNotification('출력 폴더가 선택되었습니다.', 'success');
      }
    } catch (error) {
      console.error('출력 폴더 선택 오류:', error);
      this.showNotification('폴더 선택 중 오류가 발생했습니다.', 'error');
    }
  }

  async loadImages() {
    try {
      const imageFiles = await invoke('get_image_files', { folderPath: this.inputPath });
      this.images = imageFiles.map(file => {
        const fullName = file.split('/').pop() || file.split('\\\\').pop();
        const nameWithoutExtension = this.removeFileExtension(fullName);
        
        // 🔧 한글 파일명 정규화 (자음/모음 분리 방지)
        const normalizedName = this.normalizeKoreanText(nameWithoutExtension);
        
        return {
          path: file,
          name: fullName, // 원본 파일명 (확장자 포함)
          nameWithoutExtension: normalizedName, // 정규화된 파일명 (확장자 제거 + 한글 정규화)
          text: '',
          selected: true, // 기본적으로 모든 이미지 선택됨
          // 나중에 썸네일을 비동기로 로드할 예정
          thumbnailData: null,
          thumbnailLoaded: false
        };
      });

      console.log(`${this.images.length}개의 이미지가 로드되었습니다:`, this.images);
      this.showNotification(`${this.images.length}개의 이미지가 로드되었습니다.`, 'success');
      
      // 썸네일 비동기 로드 시작
      this.loadThumbnails();
    } catch (error) {
      console.error('이미지 로드 오류:', error);
      this.showNotification('이미지 로드 중 오류가 발생했습니다.', 'error');
      this.images = [];
    }
  }

  toggleMode(isBatch) {
    this.isBatchMode = isBatch;
    this.toggleBatchBtn.classList.toggle('active', isBatch);
    this.toggleIndividualBtn.classList.toggle('active', !isBatch);
  }

  toggleTextMode(isAuto) {
    this.isAutoText = isAuto;
    this.toggleAutoTextBtn.classList.toggle('active', isAuto);
    this.toggleCustomTextBtn.classList.toggle('active', !isAuto);
    this.customTextGroup.style.display = isAuto ? 'none' : 'block';
    this.updatePreviewDebounced(); // 디바운싱 사용
  }

  startProcessing() {
    if (!this.loginManager.checkLoginStatus()) {
      this.showNotification('로그인이 필요합니다.', 'error');
      return;
    }
    
    if (!this.inputPath || !this.outputPath) {
      this.showNotification('입력 폴더와 출력 폴더를 선택해주세요.', 'error');
      return;
    }

    if (this.images.length === 0) {
      this.showNotification('처리할 이미지가 없습니다.', 'error');
      return;
    }

    if (this.isBatchMode) {
      this.openBatchModal();
    } else {
      this.openIndividualModal();
    }
  }

  openBatchModal() {
    this.batchModal.style.display = 'block';
    this.createThumbnails();
    this.updatePreview();
  }

  closeBatchModalHandler() {
    this.batchModal.style.display = 'none';
  }

  openIndividualModal() {
    this.individualModal.style.display = 'block';
    this.createIndividualImageList();
    this.updateIndividualPreview();
  }

  closeIndividualModalHandler() {
    this.individualModal.style.display = 'none';
  }

  closeLogModalHandler() {
    this.logModal.style.display = 'none';
  }

  // 최적화된 썸네일 로딩 (더 작은 청크)
  async loadThumbnails() {
    console.log('썸네일 로딩 시작...');
    
    // 더 작은 청크로 나누어 부드러운 로딩 (5개 -> 3개)
    const chunkSize = 3;
    for (let i = 0; i < this.images.length; i += chunkSize) {
      const chunk = this.images.slice(i, i + chunkSize);
      
      await Promise.all(chunk.map(async (image, index) => {
        try {
          const thumbnailData = await invoke('get_image_thumbnail', { imagePath: image.path });
          image.thumbnailData = thumbnailData;
          image.thumbnailLoaded = true;
          
          // 썸네일이 로드된 후 UI 업데이트
          this.updateThumbnailInUI(i + index);
          
          console.log(`썸네일 로드 완료: ${image.name}`);
        } catch (error) {
          console.error(`썸네일 로드 실패 (${image.name}):`, error);
          image.thumbnailLoaded = true;
        }
      }));
      
      // 다음 청크 전에 더 짧은 대기 (100ms -> 50ms)
      if (i + chunkSize < this.images.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    console.log('모든 썸네일 로딩 완료');
  }

  updateThumbnailInUI(imageIndex) {
    // 일반 썸네일 컨테이너에서 업데이트 (일방 처리 모드)
    const thumbnailElement = document.querySelector(`[data-image-index="${imageIndex}"] img`);
    if (thumbnailElement && this.images[imageIndex].thumbnailData) {
      thumbnailElement.src = this.images[imageIndex].thumbnailData;
      thumbnailElement.style.display = 'block';
    }
    
    // 개별 이미지 리스트에서도 업데이트 (개별 처리 모드)
    const individualThumbnailElement = document.querySelector(`[data-image-index="${imageIndex}"]`);
    if (individualThumbnailElement && this.images[imageIndex].thumbnailData) {
      individualThumbnailElement.src = this.images[imageIndex].thumbnailData;
      individualThumbnailElement.style.display = 'block';
      
      console.log(`개별 이미지 리스트 썸네일 업데이트: ${this.images[imageIndex].name}`);
    }
  }

  createThumbnails() {
    this.thumbnailsContainer.innerHTML = '';
    
    if (this.images.length === 0) {
      this.thumbnailsContainer.innerHTML = '<p>이미지가 없습니다.</p>';
      return;
    }
    
    this.images.forEach((image, index) => {
      const thumbnail = document.createElement('div');
      thumbnail.className = `thumbnail ${index === this.selectedImageIndex ? 'selected' : ''}`;
      thumbnail.setAttribute('data-image-index', index);
      
      // 썸네일 데이터가 있으면 사용, 없으면 로딩 표시
      const imgSrc = image.thumbnailData || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiNmMGYwZjAiLz48dGV4dCB4PSI1MCIgeT0iNTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OTk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9IjAuM2VtIj5Mb2FkaW5nLi4uPC90ZXh0Pjwvc3ZnPg==';
      const displayStyle = image.thumbnailData ? 'block' : 'none';
      
      thumbnail.innerHTML = `
        <img src="${imgSrc}" alt="${image.name}" style="display: ${displayStyle};">
        <div class="thumbnail-label">${image.name}</div>
      `;
      
      thumbnail.addEventListener('click', () => {
        document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('selected'));
        thumbnail.classList.add('selected');
        this.selectedImageIndex = index;
        this.updatePreviewDebounced(); // 디바운싱 사용
      });
      
      this.thumbnailsContainer.appendChild(thumbnail);
    });
  }

  // 🔧 완전히 수정된 개별 이미지 리스트 생성
  createIndividualImageList() {
    this.individualImageContainer.innerHTML = '';
    
    if (this.images.length === 0) {
      this.individualImageContainer.innerHTML = '<p>이미지가 없습니다.</p>';
      return;
    }
    
    // 전체 선택/해제 버튼 추가
    const selectAllContainer = document.createElement('div');
    selectAllContainer.style.marginBottom = '1rem';
    selectAllContainer.style.padding = '0.5rem';
    selectAllContainer.style.backgroundColor = '#f8f9fa';
    selectAllContainer.style.borderRadius = '4px';
    selectAllContainer.style.border = '1px solid #dee2e6';
    
    const selectedCount = this.images.filter(img => img.selected).length;
    
    selectAllContainer.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <label style="display: flex; align-items: center; cursor: pointer; font-weight: bold;">
          <input type="checkbox" id="selectAllCheckbox" 
            ${selectedCount === this.images.length ? 'checked' : ''} 
                 style="margin-right: 0.5rem; transform: scale(1.2);">
          전체 선택 (선택됨: ${selectedCount}/${this.images.length})
        </label>
        <div style="font-size: 0.85em; color: #6c757d;">
        ✅ 체크된 이미지만 처리됩니다
      </div>
      </div>
    `;
    
    this.individualImageContainer.appendChild(selectAllContainer);
    
    // 전체 선택 체크박스 이벤트 (한 번만 추가)
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    selectAllCheckbox.addEventListener('change', (e) => this.handleSelectAllChange(e));
    
    this.images.forEach((image, index) => {
      const imageItem = document.createElement('div');
      imageItem.className = 'card image-card';
      imageItem.style.marginBottom = '1rem';
      imageItem.style.position = 'relative';
      imageItem.style.transition = 'all 0.2s ease';
      imageItem.style.cursor = 'pointer';
      imageItem.style.border = image.selected ? '2px solid #dc3545' : '1px solid #dee2e6';
      imageItem.style.backgroundColor = image.selected ? '#fff5f5' : '#ffffff';
      imageItem.setAttribute('data-container-index', index);
      
      // 썸네일 데이터가 있으면 사용, 없으면 자리표시자
      const imgSrc = image.thumbnailData || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIGZpbGw9IiNmMGYwZjAiLz48dGV4dCB4PSIzMCIgeT0iMzAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI4IiBmaWxsPSIjOTk5OTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iMC4zZW0iPuuhnOuUqS4uLjwvdGV4dD48L3N2Zz4=';
      const displayStyle = image.thumbnailData ? 'block' : 'none';
      
      // 🔧 체크박스 버그 수정: 간단한 HTML 구조로 변경
      imageItem.innerHTML = `
        <div style="display: flex; align-items: center; margin-bottom: 0.5rem;">
          <div style="margin-right: 1rem; display: flex; align-items: center;">
            <input type="checkbox" ${image.selected ? 'checked' : ''} 
                   style="margin-right: 8px; transform: scale(1.3); cursor: pointer;">
            <img src="${imgSrc}" alt="${image.name}" 
                 style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; display: ${displayStyle};">
          </div>
          <div style="flex: 1;">
            <div style="font-weight: bold; margin-bottom: 0.3rem; color: ${image.selected ? '#dc3545' : '#333'};"
                 data-filename-display="${index}">
              ${image.selected ? '✅ ' : '❌ '}${image.name}
            </div>
            <input type="text" 
                   placeholder="이 이미지에 추가할 텍스트를 입력하세요" 
                   style="width: 100%; padding: 0.3rem; border-radius: 4px; 
                          border: 1px solid ${image.selected ? '#dc3545' : '#ccc'};
                          background-color: ${image.selected ? '#ffffff' : '#f8f9fa'};" 
                   ${!image.selected ? 'disabled' : ''}>
          </div>
        </div>
      `;
      
      // 🔧 체크박스 이벤트 (간단하고 확실한 방식)
      const checkbox = imageItem.querySelector('input[type="checkbox"]');
      
      checkbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        console.log(`체크박스 변경: ${image.name} -> ${isChecked}`);
        this.updateImageSelection(index, isChecked);
        this.updateSelectAllLabel();
        this.updateIndividualPreviewDebounced();
      });
      
      // 이미지 카드 클릭 이벤트 (미리보기 변경)
      imageItem.addEventListener('click', (e) => {
        // 체크박스나 텍스트 입력란 클릭 시에는 미리보기 변경하지 않음
        if (e.target.type === 'checkbox' || e.target.type === 'text') {
          return;
        }
        
        console.log(`이미지 카드 클릭: ${image.name} (인덱스: ${index})`);
        this.selectedImageIndexForPreview = index;
        this.updateIndividualPreviewDebounced();
        
        // 선택된 카드 하이라이트
        document.querySelectorAll('.image-card').forEach(card => {
          card.style.boxShadow = '';
        });
        imageItem.style.boxShadow = '0 4px 12px rgba(0,123,255,0.3)';
        
        // 미리보기 메시지 표시
        this.showNotification(`${image.name}의 미리보기를 표시합니다`, 'success');
      });
      
      // 텍스트 입력 이벤트 (간단한 방식)
      const textInput = imageItem.querySelector('input[type="text"]');
      textInput.value = image.text;
      textInput.addEventListener('input', (e) => {
        // 한글 정규화
        const normalizedText = this.normalizeKoreanText(e.target.value);
        this.images[index].text = normalizedText;
        
        // 입력창에도 정규화된 텍스트 반영
        if (normalizedText !== e.target.value) {
          const selectionStart = e.target.selectionStart;
          const selectionEnd = e.target.selectionEnd;
          e.target.value = normalizedText;
          e.target.setSelectionRange(selectionStart, selectionEnd);
        }
        
        // 현재 미리보기 중인 이미지라면 미리보기 업데이트
        if (this.selectedImageIndexForPreview === index) {
          this.updateIndividualPreviewDebounced();
        }
      });
      
      this.individualImageContainer.appendChild(imageItem);
    });
    
    // 첫 번째 선택된 이미지를 미리보기로 설정
    const firstSelectedIndex = this.images.findIndex(img => img.selected);
    this.selectedImageIndexForPreview = firstSelectedIndex !== -1 ? firstSelectedIndex : 0;
    
    console.log(`초기 미리보기 이미지 설정: 인덱스 ${this.selectedImageIndexForPreview}`);
  }

  // 경량화된 미리보기 업데이트 함수
  async updatePreview() {
    if (this.images.length === 0 || this.selectedImageIndex >= this.images.length) {
      this.previewImage.src = '';
      this.previewImage.alt = '이미지가 없습니다.';
      return;
    }

    const selectedImage = this.images[this.selectedImageIndex];
    const previewText = this.isAutoText ? selectedImage.nameWithoutExtension : this.customText.value;
    
    // 캐시 키 생성
    const cacheKey = this.getCacheKey(
      selectedImage.path,
      previewText,
      this.currentSettings.fontSize,
      this.currentSettings.positionX,
      this.currentSettings.positionY
    );
    
    // 캐시에서 확인
    const cachedPreview = this.getFromCache(cacheKey);
    if (cachedPreview) {
      this.previewImage.src = cachedPreview;
      this.previewImage.alt = selectedImage.name;
      return;
    }
    
    console.log(`미리보기 업데이트: ${selectedImage.name}, 텍스트: "${previewText}"`);
    
    try {
      // 이미지 크기 가져오기
      const imageDimensions = await this.getImageDimensions(selectedImage.path);
      const scaledFontSize = this.calculateScaledFontSize(imageDimensions, this.currentSettings.fontSize);
      const position = this.calculateRightBasedPosition(imageDimensions, this.currentSettings.positionX, this.currentSettings.positionY, scaledFontSize, previewText);
      
      // 안전한 값으로 변환
      const safeX = Math.max(0, Math.floor(position.x)) || 0;
      const safeY = Math.max(0, Math.floor(position.y)) || 0;
      const safeFontSize = Math.max(10, Math.floor(scaledFontSize)) || 20;
      
      // 경량화된 미리보기 함수 사용
      const previewData = await invoke('get_image_preview_lightweight', {
        imagePath: selectedImage.path,
        text: previewText || selectedImage.nameWithoutExtension,
        fontSize: safeFontSize,
        positionX: safeX,
        positionY: safeY
      });
      
      this.previewImage.src = previewData;
      this.previewImage.alt = selectedImage.name;
      
      // 캐시에 저장
      this.addToCache(cacheKey, previewData);
      
    } catch (error) {
      console.error(`미리보기 생성 실패:`, error);
      
      // 캐시 클리어 후 기본 처리
      this.clearCache();
      
      // 실패 시 썸네일 사용
      if (selectedImage.thumbnailData) {
        this.previewImage.src = selectedImage.thumbnailData;
        this.previewImage.alt = selectedImage.name;
      } else {
        this.previewImage.src = '';
        this.previewImage.alt = '이미지 로드 실패';
      }
    }
  }

  // 경량화된 개별 미리보기 업데이트
  async updateIndividualPreview() {
    if (this.images.length === 0) {
      this.indPreviewImage.src = '';
      this.indPreviewImage.alt = '이미지가 없습니다.';
      return;
    }

    const previewIndex = this.selectedImageIndexForPreview;
    if (previewIndex >= this.images.length || previewIndex < 0) {
      this.indPreviewImage.src = '';
      this.indPreviewImage.alt = '유효하지 않은 이미지';
      return;
    }
    
    const previewImage = this.images[previewIndex];
    const previewText = previewImage.text || previewImage.nameWithoutExtension;
    
    const fontSize = parseInt(this.indFontSize.value);
    const posX = parseInt(this.indPositionX.value);
    const posY = parseInt(this.indPositionY.value);
    
    // 캐시 키 생성
    const cacheKey = this.getCacheKey(previewImage.path, previewText, fontSize, posX, posY);
    
    // 캐시에서 확인
    const cachedPreview = this.getFromCache(cacheKey);
    if (cachedPreview) {
      this.indPreviewImage.src = cachedPreview;
      this.indPreviewImage.alt = `${previewImage.name} - 미리보기 (캐시)`;
      return;
    }
    
    console.log(`개별 미리보기 업데이트: ${previewImage.name}, 텍스트: "${previewText}"`);
    
    try {
      // 이미지 크기 가져오기
      const imageDimensions = await this.getImageDimensions(previewImage.path);
      const scaledFontSize = this.calculateScaledFontSize(imageDimensions, fontSize);
      const position = this.calculateRightBasedPosition(imageDimensions, posX, posY, scaledFontSize, previewText);
      
      // 안전한 값으로 변환
      const safeX = Math.max(0, Math.floor(position.x)) || 0;
      const safeY = Math.max(0, Math.floor(position.y)) || 0;
      const safeFontSize = Math.max(10, Math.floor(scaledFontSize)) || 20;
      
      // 경량화된 미리보기 함수 사용
      const previewData = await invoke('get_image_preview_lightweight', {
        imagePath: previewImage.path,
        text: previewText || previewImage.nameWithoutExtension,
        fontSize: safeFontSize,
        positionX: safeX,
        positionY: safeY
      });
      
      this.indPreviewImage.src = previewData;
      this.indPreviewImage.alt = `${previewImage.name} - 미리보기`;
      
      // 캐시에 저장
      this.addToCache(cacheKey, previewData);
      
    } catch (error) {
      console.error(`개별 미리보기 생성 실패:`, error);
      
      // 실패 시 썸네일 사용
      if (previewImage.thumbnailData) {
        this.indPreviewImage.src = previewImage.thumbnailData;
        this.indPreviewImage.alt = previewImage.name;
      } else {
        this.indPreviewImage.src = '';
        this.indPreviewImage.alt = '이미지 로드 실패';
      }
    }
  }

  // 경량화된 일괄 처리
  async processBatchImages() {
    const logs = [];
    
    try {
      this.showNotification('이미지 처리를 시작합니다...', 'success');
      
      // 캐시 클리어 (메모리 확보)
      this.clearCache();
      
      for (let i = 0; i < this.images.length; i++) {
        const image = this.images[i];
        const text = this.isAutoText ? image.nameWithoutExtension : this.customText.value;
        
        try {
          // 이미지 크기 가져오기
          const imageDimensions = await this.getImageDimensions(image.path);
          const scaledFontSize = this.calculateScaledFontSize(imageDimensions, this.currentSettings.fontSize);
          const position = this.calculateRightBasedPosition(imageDimensions, this.currentSettings.positionX, this.currentSettings.positionY, scaledFontSize, text);
          
          console.log(`${image.name}: ${imageDimensions.width}x${imageDimensions.height}, 위치: (${position.x}, ${position.y}), 크기: ${scaledFontSize}px`);
          
          // 안전한 값으로 변환
          const safeX = Math.max(0, Math.floor(position.x)) || 0;
          const safeY = Math.max(0, Math.floor(position.y)) || 0;
          const safeFontSize = Math.max(10, Math.floor(scaledFontSize)) || 20;
          
          // 경량화된 이미지 처리 함수 사용 (내부적으로 add_text_to_image_simple 사용)
          const result = await invoke('process_image', {
            imagePath: image.path,
            outputPath: this.outputPath,
            text: text || image.nameWithoutExtension,
            fontSize: safeFontSize,
            positionX: safeX,
            positionY: safeY
          });

          if (result.success) {
            logs.push({ type: 'success', message: `✓ ${image.name} 처리 완료` });
          } else {
            logs.push({ type: 'error', message: `✗ ${image.name} 처리 실패: ${result.error}` });
          }
        } catch (imageError) {
          console.error(`${image.name} 처리 중 오류:`, imageError);
          logs.push({ type: 'error', message: `✗ ${image.name} 처리 실패: ${imageError.message}` });
        }
      }
    } catch (error) {
      console.error('일괄 처리 오류:', error);
      logs.push({ type: 'error', message: `처리 중 오류 발생: ${error.message}` });
    }

    this.closeBatchModalHandler();
    this.showProcessingResults(logs);
  }

  // 경량화된 개별 처리
  async processIndividualImages() {
    const logs = [];
    
    // 선택된 이미지만 처리
    const selectedImages = this.images.filter(img => img.selected);
    
    if (selectedImages.length === 0) {
      this.showNotification('선택된 이미지가 없습니다.', 'error');
      return;
    }
    
    try {
      this.showNotification(`선택된 ${selectedImages.length}개 이미지 처리를 시작합니다...`, 'success');
      
      // 캐시 클리어 (메모리 확보)
      this.clearCache();
      
      const fontSize = parseInt(this.indFontSize.value);
      const posX = parseInt(this.indPositionX.value);
      const posY = parseInt(this.indPositionY.value);

      for (let i = 0; i < selectedImages.length; i++) {
        const image = selectedImages[i];
        const text = image.text || image.nameWithoutExtension;
        
        try {
          // 이미지 크기 가져오기
          const imageDimensions = await this.getImageDimensions(image.path);
          const scaledFontSize = this.calculateScaledFontSize(imageDimensions, fontSize);
          const position = this.calculateRightBasedPosition(imageDimensions, posX, posY, scaledFontSize, text);
          
          console.log(`${image.name}: ${imageDimensions.width}x${imageDimensions.height}, 위치: (${position.x}, ${position.y}), 크기: ${scaledFontSize}px`);
          
          // 안전한 값으로 변환
          const safeX = Math.max(0, Math.floor(position.x)) || 0;
          const safeY = Math.max(0, Math.floor(position.y)) || 0;
          const safeFontSize = Math.max(10, Math.floor(scaledFontSize)) || 20;
          
          // 경량화된 이미지 처리 함수 사용
          const result = await invoke('process_image', {
            imagePath: image.path,
            outputPath: this.outputPath,
            text: text || image.nameWithoutExtension,
            fontSize: safeFontSize,
            positionX: safeX,
            positionY: safeY
          });

          if (result.success) {
            logs.push({ type: 'success', message: `✓ ${image.name} 처리 완료` });
          } else {
            logs.push({ type: 'error', message: `✗ ${image.name} 처리 실패: ${result.error}` });
          }
        } catch (imageError) {
          console.error(`${image.name} 처리 중 오류:`, imageError);
          logs.push({ type: 'error', message: `✗ ${image.name} 처리 실패: ${imageError.message}` });
        }
      }
      
      // 선택되지 않은 이미지들도 로그에 추가
      const unselectedImages = this.images.filter(img => !img.selected);
      unselectedImages.forEach(image => {
        logs.push({ type: 'info', message: `⏭️ ${image.name} 건너뛰기 (선택 안됨)` });
      });
      
    } catch (error) {
      console.error('개별 처리 오류:', error);
      logs.push({ type: 'error', message: `처리 중 오류 발생: ${error.message}` });
    }

    this.closeIndividualModalHandler();
    this.showProcessingResults(logs);
  }

  // 이미지 크기 가져오기
  async getImageDimensions(imagePath) {
    try {
      return await invoke('get_image_dimensions', { imagePath });
    } catch (error) {
      console.error('이미지 크기 가져오기 오류:', error);
      // 기본값 반환
      return { width: 400, height: 300 };
    }
  }

  // 🔧 텍스트 크기 일관성 개선: 더 일관된 상대적 크기 계산
  calculateScaledFontSize(imageDimensions, baseFontSize) {
    // 상대적 크기 모드: 이미지 크기에 비례하되 더 일관된 기준 사용
    
    // 기준 이미지 면적 (400x300 = 120,000)
    const baseImageArea = 400 * 300;
    
    // 현재 이미지 면적
    const currentImageArea = imageDimensions.width * imageDimensions.height;
    
    // 면적 비율의 제곱근으로 스케일 팩터 계산 (더 일관된 시각적 결과)
    const scaleFactor = Math.sqrt(currentImageArea / baseImageArea);
    
    // 스케일 팩터를 적당한 범위로 제한 (너무 크거나 작지 않게)
    const limitedScaleFactor = Math.max(0.5, Math.min(scaleFactor, 3.0));
    
    // 최종 폰트 크기 계산
    const scaledSize = baseFontSize * limitedScaleFactor;
    
    // 안전한 범위 내에서 반환
    return Math.max(10, Math.min(Math.round(scaledSize), 200));
  }

  // 🔧 텍스트 박스 문제 해결: 더 정확한 위치 계산
  calculateRightBasedPosition(imageDimensions, rightPercentage, bottomPercentage, fontSize = 20, text = 'Sample') {
    // 🔧 더 정확한 텍스트 크기 추정
    const estimatedTextWidth = this.estimateTextWidth(text, fontSize);
    const estimatedTextHeight = fontSize; // 행간 제거하여 높이 축소
    const padding = 2; // 4 -> 2로 패딩 축소
    
    // 🔧 우측 기준 계산: 텍스트 끝이 정확한 위치에
    let x = imageDimensions.width * (1 - rightPercentage / 100) - estimatedTextWidth;
    
    // 🔧 하단 기준 계산
    let y = imageDimensions.height * (1 - bottomPercentage / 100) - estimatedTextHeight;
    
    // 🔧 안전 장치: 텍스트가 이미지 경계를 벗어나지 않도록
    x = Math.max(padding, Math.min(x, imageDimensions.width - estimatedTextWidth - padding));
    y = Math.max(padding, Math.min(y, imageDimensions.height - estimatedTextHeight - padding));
    
    return {
      x: Math.round(x),
      y: Math.round(y)
    };
  }
  
  // 🔧 텍스트 박스 문제 해결: Rust와 완전히 일치하는 너비 계산
  estimateTextWidth(text, fontSize) {
    if (!text) return 10; // 최소 너비
    
    let totalWidth = 0;
    const charCount = text.length;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      let charWidth;
      
      // 🔧 Rust와 적확히 동일한 문자 너비 계산
      if (char === '1') {
        charWidth = fontSize * 0.2; // 1은 특별히 좁음
      } else if (['i', 'l', '!', '|', 'I', 'j', '.', ','].includes(char)) {
        charWidth = fontSize * 0.25; // 매우 좁은 문자
      } else if (['t', 'f', 'r', "'", '"'].includes(char)) {
        charWidth = fontSize * 0.35; // 조금 증가
      } else if (['W', 'M'].includes(char)) {
        charWidth = fontSize * 0.7; // 0.8 -> 0.7
      } else if (['w', 'm'].includes(char)) {
        charWidth = fontSize * 0.65; // 0.75 -> 0.65
      } else if (char === ' ') {
        charWidth = fontSize * 0.2; // 0.25 -> 0.2
      } else if (char >= '가' && char <= '힣') {
        charWidth = fontSize * 0.7; // 한글 완성형 0.8 -> 0.7
      } else if (char >= 'ㄱ' && char <= 'ㅎ') {
        charWidth = fontSize * 0.4; // 한글 자음 0.5 -> 0.4
      } else if (char >= 'ㅏ' && char <= 'ㅣ') {
        charWidth = fontSize * 0.3; // 한글 모음 0.4 -> 0.3
      } else if (char >= 'ㅤ' && char <= 'ㆎ') {
        charWidth = fontSize * 0.45; // 한글 확장 0.55 -> 0.45
      } else if (['0', '8'].includes(char)) {
        charWidth = fontSize * 0.5; // 0.6 -> 0.5
      } else if (char >= '2' && char <= '7' || char === '9') {
        charWidth = fontSize * 0.45; // 0.55 -> 0.45
      } else if (['A', 'H', 'N', 'U', 'V', 'X', 'Y', 'Z'].includes(char)) {
        charWidth = fontSize * 0.55; // 0.65 -> 0.55
      } else if (['Q', 'G', 'O', 'D'].includes(char)) {
        charWidth = fontSize * 0.6; // 0.7 -> 0.6
      } else if (['B', 'C', 'E', 'F', 'K', 'L', 'P', 'R', 'S', 'T', 'J'].includes(char)) {
        charWidth = fontSize * 0.5; // 0.6 -> 0.5
      } else if (['a', 'c', 'e', 'g', 'o', 'q', 's'].includes(char)) {
        charWidth = fontSize * 0.5; // 0.4 -> 0.5로 증가
      } else if (['b', 'd', 'h', 'k', 'n', 'p', 'u', 'v', 'x', 'y', 'z'].includes(char)) {
        charWidth = fontSize * 0.5; // 0.45 -> 0.5로 증가
      } else if (char === '-') {
        charWidth = fontSize * 0.35; // 하이픈은 특히 좁음
      } else if (['_', '=', '+'].includes(char)) {
        charWidth = fontSize * 0.4; // 0.45 -> 0.4
      } else if (['@', '%', '#', '&'].includes(char)) {
        charWidth = fontSize * 0.6; // 0.7 -> 0.6
      } else {
        charWidth = fontSize * 0.45; // 기본값 0.55 -> 0.45
      }
      
      totalWidth += charWidth;
      
      // 🔧 문자 간 간격 완전 제거 (Rust와 동일)
      // 간격을 추가하지 않음
    }
    
    // 🔧 여유 공간 약간 추가 (Rust와 동일)
    const finalWidth = totalWidth * 1.1; // 10% 여유 추가
    
    // 최소/최대 제한
    return Math.round(Math.max(10, Math.min(finalWidth, fontSize * text.length * 0.8)));
  }

  showProcessingResults(logs) {
    this.logContent.innerHTML = '';
    
    logs.forEach(log => {
      const logEntry = document.createElement('div');
      logEntry.className = `log-entry log-${log.type}`;
      
      // 로그 타입에 따른 스타일 적용
      if (log.type === 'info') {
        logEntry.style.color = '#6c757d';
        logEntry.style.backgroundColor = '#f8f9fa';
        logEntry.style.border = '1px solid #dee2e6';
        logEntry.style.padding = '0.25rem 0.5rem';
        logEntry.style.borderRadius = '4px';
        logEntry.style.margin = '2px 0';
      }
      
      logEntry.textContent = log.message;
      this.logContent.appendChild(logEntry);
    });
    
    this.logModal.style.display = 'block';
    
    const successCount = logs.filter(log => log.type === 'success').length;
    const errorCount = logs.filter(log => log.type === 'error').length;
    const infoCount = logs.filter(log => log.type === 'info').length;
    const totalProcessed = successCount + errorCount;
    
    let message = '';
    if (totalProcessed === 0) {
      message = '처리된 이미지가 없습니다.';
    } else if (errorCount === 0) {
      message = `모든 이미지 처리가 완료되었습니다! (처리: ${successCount}개${infoCount > 0 ? `, 건너뛰기: ${infoCount}개` : ''})`;
    } else {
      message = `${successCount}/${totalProcessed} 이미지 처리 완료${infoCount > 0 ? ` (건너뛰기: ${infoCount}개)` : ''}`;
    }
    
    this.showNotification(message, errorCount === 0 ? 'success' : 'error');
  }

  // 성능 개선을 위한 알림 함수 최적화
  showNotification(message, type = 'success') {
    // 기존 타이머 클리어
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer);
    }
    
    this.notification.textContent = message;
    this.notification.className = `notification ${type}`;
    this.notification.style.display = 'block';
    
    this.notificationTimer = setTimeout(() => {
      this.notification.style.display = 'none';
    }, 2500); // 3초 -> 2.5초로 단축
  }
}

// DOM이 로드되면 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
  new ImageOverlayApp();
});