const fs = require('fs');
const { google } = require('googleapis');
const { chromium } = require('playwright');

// ==========================================
// 1. CẤU HÌNH GOOGLE SHEETS & ZINGPROXY
// ==========================================
const SPREADSHEET_ID = '1Z3uqtqFZGyk8BuWxIiRxp-4DmZ2hapkDsSW2sW_u60I';
const READ_RANGE = 'Trang tính1!C2:D';
const PROCESSED_RANGE = 'KetQua!A2:A';
const CREDENTIALS_PATH = './credentials.json';

// Nếu chạy trên GitHub Actions, tự động tạo file credentials.json từ biến môi trường
if (process.env.GOOGLE_CREDENTIALS && !fs.existsSync(CREDENTIALS_PATH)) {
    fs.writeFileSync(CREDENTIALS_PATH, process.env.GOOGLE_CREDENTIALS);
}

// Cấu hình ZingProxy bằng User & Password (Bắt buộc khi chạy trên GitHub)
const PROXY_CONFIG = {
    server: 'http://103.183.114.192:8558',
    username: '6lw16uzythaov',
    password: 'omFfdcWf'
};

const ZING_CHANGE_IP_URL = 'https://api.zingproxy.com/open/change-ip/q1f615t9zpj9d656f25f071f10675499e907fe6f0e30662b2dc715c';
const ROTATE_INTERVAL_MS = 61000;

// ==========================================
// 2. HÀM GỌI API ĐỔI IP ZINGPROXY
// ==========================================
async function doiIpZingProxy() {
    try {
        console.log(' -> [ZingProxy] Đang kích hoạt Link đổi IP...');
        const response = await fetch(ZING_CHANGE_IP_URL);
        const text = await response.text();
        console.log(` -> [ZingProxy] Phản hồi: ${text.trim().substring(0, 120)}`);
        await new Promise(r => setTimeout(r, 5000));
    } catch (error) {
        console.log(' -> [ZingProxy] Không gọi được Link change IP:', error.message);
    }
}

// ==========================================
// 3. CÁC HÀM ĐỌC / GHI GOOGLE SHEETS
// ==========================================
async function getSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        keyFile: CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
}

async function getSheetData() {
    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: READ_RANGE,
        });
        return response.data.values || [];
    } catch (error) {
        console.error('Lỗi khi đọc Trang tính1:', error.message);
        return [];
    }
}

async function getProcessedAccounts() {
    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: PROCESSED_RANGE,
        });
        const rows = response.data.values || [];
        const processedSet = new Set();
        for (const row of rows) {
            if (row[0]) processedSet.add(row[0].trim().toLowerCase());
        }
        return processedSet;
    } catch (error) {
        return new Set();
    }
}

async function ghiDuLieu(duLieuArr) {
    try {
        const sheets = await getSheetsClient();
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'KetQua!A:E',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [duLieuArr] },
        });
        console.log(' -> Đã ghi kết quả vào Sheet KetQua (Cột A -> E).');
    } catch (error) {
        console.error(' -> Lỗi khi ghi Sheet:', error.message);
    }
}

async function dongPopupNeuCo(page) {
    for (let i = 0; i < 4; i++) {
        const closeBtn = page.locator('span[translate="Common_Closed"]').first();
        if (await closeBtn.isVisible().catch(() => false)) {
            await closeBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(1000);
        } else {
            break;
        }
    }
}

// ==========================================
// 4. HÀM LẤY CẤP VIP
// ==========================================
async function layCapVip(page) {
    let capVip = 'Không rõ';
    try {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(500);
        const originUrl = new URL(page.url()).origin;

        const memberCenterMenu = page.locator('span[translate="Shared_Member_Center"]').first();
        if (await memberCenterMenu.isVisible().catch(() => false)) {
            await memberCenterMenu.hover().catch(() => {});
            await memberCenterMenu.click({ force: true }).catch(() => {});
            await page.waitForTimeout(1200);
        }

        const securityListLink = page.locator('a[ui-sref="security-list"], a[href*="/MemberCenter/SecurityList"]').first();
        if (await securityListLink.isVisible().catch(() => false)) {
            await securityListLink.click({ force: true });
            await page.waitForTimeout(2000);
        } else {
            await page.goto(`${originUrl}/MemberCenter/SecurityList`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            await page.waitForTimeout(2500);
        }

        const vipAreaBtn = page.locator('span[translate="MemberCenter_VIP"], a[ui-sref="vip"], a[href*="/VIP"]').first();
        if (await vipAreaBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
            await vipAreaBtn.click({ force: true });
            await page.waitForTimeout(2500);
        } else {
            await page.goto(`${originUrl}/VIP`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            await page.waitForTimeout(2500);
        }

        await page.waitForSelector('span[ng-bind="$ctrl.nextLevel"], span[ng-bind*="Level"], span[ng-bind*="level"]', { timeout: 10000 }).catch(() => {});

        capVip = await page.evaluate(() => {
            const currentEl = document.querySelector('span[ng-bind="$ctrl.currentLevel"], span[ng-bind="$ctrl.level"], span[ng-bind="$ctrl.vipLevel"]');
            if (currentEl && currentEl.innerText.trim() !== '') {
                return `VIP ${currentEl.innerText.trim()}`;
            }
            const nextEl = document.querySelector('span[ng-bind="$ctrl.nextLevel"]');
            if (nextEl && nextEl.innerText.trim() !== '') {
                const nextVal = parseInt(nextEl.innerText.trim(), 10);
                if (!isNaN(nextVal)) {
                    return `VIP ${Math.max(0, nextVal - 1)}`;
                }
            }
            const bodyText = document.body.innerText;
            const match = bodyText.match(/VIP\s*(\d+)\s*Điều kiện nâng cấp/i);
            if (match && match[1]) {
                return `VIP ${Math.max(0, parseInt(match[1], 10) - 1)}`;
            }
            return 'VIP 0';
        });

        console.log(` -> ✅ Cấp VIP của tài khoản: ${capVip}`);
    } catch (vipErr) {
        console.log(' -> ⚠️ Lỗi khi đọc cấp VIP:', vipErr.message);
    }
    return capVip;
}

// ==========================================
// 5. HÀM CHẠY TỰ ĐỘNG HÓA TRÊN ĐÁM MÂY
// ==========================================
async function runAutomation() {
    const allRows = await getSheetData();
    const processedSet = await getProcessedAccounts();

    // Lọc các tài khoản mới chưa có trong tab KetQua
    const newAccounts = [];
    for (const row of allRows) {
        const user = row[0] ? row[0].trim() : '';
        const pass = row[1] ? row[1].trim() : '';
        if (!user || !pass) continue;

        const userKey = user.toLowerCase();
        if (!processedSet.has(userKey)) {
            newAccounts.push({ username: user, password: pass, userKey });
            processedSet.add(userKey); // Chống trùng ngay trong danh sách đầu vào
        }
    }

    if (newAccounts.length === 0) {
        console.log('Không có tài khoản mới nào cần xử lý trong đợt này. Kết thúc phiên!');
        return;
    }

    console.log(`Phát hiện ${newAccounts.length} tài khoản mới. Đang khởi động trình duyệt ngầm (Headless)...`);
    const browser = await chromium.launch({
        headless: true, // Bắt buộc là true khi chạy trên máy chủ GitHub
        proxy: PROXY_CONFIG
    });

    let lastRunTime = 0;

    for (const [index, acc] of newAccounts.entries()) {
        const { username, password } = acc;
        console.log(`\n[${index + 1}/${newAccounts.length}] Đang xử lý: ${username}`);

        if (lastRunTime > 0) {
            const elapsed = Date.now() - lastRunTime;
            const remain = ROTATE_INTERVAL_MS - elapsed;
            if (remain > 0) {
                console.log(` -> Chờ ${Math.ceil(remain / 1000)} giây để đủ chu kỳ 60s đổi IP...`);
                await new Promise(r => setTimeout(r, remain));
            }
        }

        await doiIpZingProxy();
        lastRunTime = Date.now();

        const context = await browser.newContext({
            proxy: PROXY_CONFIG,
            ignoreHTTPSErrors: true
        });
        const page = await context.newPage();

        await page.addLocatorHandler(
            page.locator('span[translate="Common_Closed"]'),
            async (btn) => {
                await btn.click({ force: true }).catch(() => {});
                await page.waitForTimeout(800);
            }
        );

        try {
            try {
                await page.goto('http://api.ipify.org?format=json', { timeout: 15000 });
                const ipData = JSON.parse(await page.innerText('body'));
                console.log(` -> ✅ IP ZingProxy hiện tại: ${ipData.ip}`);
            } catch (e) {
                console.log(' -> ⚠️ Không đọc được IP kiểm tra:', e.message);
            }

            await page.goto('https://78966bj.top/Login', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);
            await dongPopupNeuCo(page);

            const userInp = page.locator('input[ng-model="$ctrl.user.account.value"], input[placeholder="Tài khoản"]').first();
            await userInp.waitFor({ state: 'visible', timeout: 15000 });
            await userInp.fill(username);

            const passInp = page.locator('input[type="password"], input[placeholder="Mật khẩu"]').first();
            await passInp.fill(password);

            const loginBtn = page.locator('form[ng-submit="$ctrl.login()"] button, button:has-text("Đăng nhập")').first();
            await loginBtn.click();

            await page.waitForTimeout(4000);
            await dongPopupNeuCo(page);

            const infoBtn = page.locator('span[translate="Shared_Member_Center"]').first();
            const isLoginSuccess = await infoBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);

            if (!isLoginSuccess) {
                console.log(` -> Tài khoản ${username}: Sai mật khẩu!`);
                await ghiDuLieu([username, password, 'Sai mật khẩu', '', '']);
            } else {
                let strGiaoDich = '';
                let trangThai = 'Thành công';

                // Bước A: Lấy cấp VIP trước
                const capVip = await layCapVip(page);

                // Bước B: Lọc giao dịch 30 ngày
                try {
                    const memberMenu = page.locator('span[translate="Shared_Member_Center"]').first();
                    if (await memberMenu.isVisible().catch(() => false)) {
                        await memberMenu.click({ force: true });
                        await page.waitForTimeout(1500);
                    }

                    const transBtn = page.locator('a[ui-sref="transaction"], span[translate="Shared_Transaction_Record"]').first();
                    if (await transBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
                        await transBtn.click({ force: true });
                    } else {
                        const originUrl = new URL(page.url()).origin;
                        await page.goto(`${originUrl}/Transaction`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
                    }
                    await page.waitForTimeout(2500);

                    const customBtn = page.locator('span[translate="Transaction_Custom"]').first();
                    await customBtn.waitFor({ state: 'visible', timeout: 12000 });
                    await customBtn.click({ force: true });
                    await page.waitForTimeout(1000);

                    const today = new Date();
                    const endDate = today.getFullYear() + '/' + String(today.getMonth() + 1).padStart(2, '0') + '/' + String(today.getDate()).padStart(2, '0');
                    const pastDate = new Date();
                    pastDate.setDate(today.getDate() - 29);
                    const startDate = pastDate.getFullYear() + '/' + String(pastDate.getMonth() + 1).padStart(2, '0') + '/' + String(pastDate.getDate()).padStart(2, '0');

                    const beginInput = page.locator('input[ng-model="$ctrl.timeBegin"]');
                    const endInput = page.locator('input[ng-model="$ctrl.timeEnd"]');
                    await beginInput.waitFor({ state: 'visible', timeout: 10000 });

                    await beginInput.fill(startDate);
                    await beginInput.dispatchEvent('change');
                    await beginInput.press('Enter');

                    await endInput.fill(endDate);
                    await endInput.dispatchEvent('change');
                    await endInput.press('Enter');

                    const searchBtn = page.locator('button:has(i.fa-search), .fa-search, button[ng-click*="search"], button[ng-click*="Search"], button[ng-click*="submit"]').first();
                    if (await searchBtn.isVisible().catch(() => false)) {
                        await searchBtn.click({ force: true });
                    }

                    await page.waitForTimeout(3500);

                    const hasTransactions = await page.waitForSelector('span[ng-bind="transaction.amount"]', { timeout: 6000 }).catch(() => null);

                    if (hasTransactions) {
                        const transactions = await page.evaluate(() => {
                            const results = [];
                            const amountSpans = document.querySelectorAll('span[ng-bind="transaction.amount"]');
                            for (const span of amountSpans) {
                                const row = span.closest('tr');
                                if (row) {
                                    const cells = row.querySelectorAll('td');
                                    if (cells.length >= 3) {
                                        const thoiGian = cells[0].innerText.trim().replace(/\s+/g, ' ').split(' - ')[0].trim();
                                        const soTien = cells[1].innerText.trim();
                                        const phanLoai = cells[2].innerText.trim();
                                        const loaiLower = phanLoai.toLowerCase();

                                        const isUuDai = loaiLower.includes('ưu đãi') || loaiLower.includes('hoàn trả') || loaiLower.includes('phong bì') || loaiLower.includes('khuyến mãi');
                                        const isNapRut = !isUuDai && (
                                            loaiLower.includes('nạp') ||
                                            loaiLower.includes('rút') ||
                                            loaiLower.includes('gửi') ||
                                            loaiLower.includes('chuyển khoản') ||
                                            loaiLower.includes('thanh toán')
                                        );

                                        if (isNapRut) {
                                            results.push(`[${thoiGian}] ${phanLoai}: ${soTien}`);
                                            if (results.length >= 5) break;
                                        }
                                    }
                                }
                            }
                            return results;
                        });

                        if (transactions.length > 0) {
                            strGiaoDich = transactions.join('\n');
                        } else {
                            trangThai = 'Không có đơn nạp/rút';
                        }
                    } else {
                        trangThai = 'Không có giao dịch (30 ngày)';
                    }
                } catch (transErr) {
                    trangThai = 'Không có giao dịch (30 ngày)';
                }

                await ghiDuLieu([username, password, trangThai, strGiaoDich, capVip]);
                console.log(`Hoàn tất: ${username} | ${trangThai} | ${capVip}`);
            }
        } catch (error) {
            console.error(`Lỗi ở tài khoản ${username}:`, error.message);
            await ghiDuLieu([username, password, 'Sai mật khẩu', '', '']);
        } finally {
            await context.close();
        }
    }

    await browser.close();
    console.log('\nĐã xử lý xong toàn bộ tài khoản mới trong đợt này!');
}

runAutomation();