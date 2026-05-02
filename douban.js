// ==UserScript==
// @name         豆瓣图书资源检测（微信读书 + Z-Library）
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  检测微信读书和Z-Library上的图书资源
// @author       You
// @match        *://book.douban.com/*
// @grant        GM_xmlhttpRequest
// @connect      weread.qq.com
// @connect      zlib.li
// @require      https://raw.githubusercontent.com/Tampermonkey/utils/refs/heads/main/requires/gh_2215_make_GM_xhr_more_parallel_again.js
// ==/UserScript==

(function () {
    'use strict';

    // 你的微信读书Cookie
    const WEREAD_COOKIE = ``;

    // 配置
    const DELAY = 2; // 两本书间隔2毫秒
    const queue = [];
    const processed = new WeakSet();
    const MAX_PARALLEL = 40; // 最大并行数（推荐2~3，油猴最安全）
    // ==========================================
    let runningCount = 0;   // 正在运行的任务数量

    // 保存书籍数据
    const bookData = new WeakMap();

    // 创建弹窗
    function createTooltip() {
        const tooltip = document.createElement('div');
        tooltip.className = 'wx-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.backgroundColor = '#333';
        tooltip.style.color = 'white';
        tooltip.style.padding = '10px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.zIndex = '9999';
        tooltip.style.maxWidth = '300px';
        tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        tooltip.style.fontSize = '12px';
        tooltip.style.display = 'none';
        document.body.appendChild(tooltip);
        return tooltip;
    }

    const tooltip = createTooltip();

    // 显示弹窗
    function showTooltip(event, books) {
        if (!books || books.length === 0) return;

        tooltip.innerHTML = books.map(book => {
            const bookInfo = book.bookInfo || {};
            return `<div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #555;">
                <div style="font-weight: bold;">${bookInfo.title || '未知书名'}</div>
                ${bookInfo.author ? `<div style="font-size: 11px; color: #aaa;">作者: ${bookInfo.author}</div>` : ''}
                ${bookInfo.category ? `<div style="font-size: 11px; color: #aaa;">分类: ${bookInfo.category}</div>` : ''}
                ${bookInfo.price ? `<div style="font-size: 11px; color: #aaa;">价格: ${bookInfo.price}</div>` : ''}
            </div>`;
        }).join('');

        tooltip.style.display = 'block';
        tooltip.style.left = (event.pageX + 10) + 'px';
        tooltip.style.top = (event.pageY - 10) + 'px';
    }

    // 隐藏弹窗
    function hideTooltip() {
        tooltip.style.display = 'none';
    }

    // 保存Z-Library书籍数据
    const zlibBookData = new WeakMap();

    // 渲染微信读书标签
    function renderWxTag(el, status, title = null, books = []) {
        const star = el.querySelector('.star');
        if (!star) return;

        const oldTag = star.querySelector('.wx-tag');
        if (oldTag) oldTag.remove();

        const tag = document.createElement('span');
        tag.className = 'wx-tag';
        tag.style.marginLeft = '8px';
        tag.style.fontSize = '12px';
        tag.style.fontWeight = 'bold';
        tag.style.cursor = status === 1 ? 'pointer' : 'default';

        if (status === 'loading') {
            tag.textContent = '微信(loading)';
            tag.style.color = '#f59e0b';
            tag.style.animation = 'wx-fade 1s infinite alternate';
            const style = document.createElement('style');
            style.textContent = '@keyframes wx-fade { from {opacity:0.5;} to {opacity:1;} }';
            if (!document.querySelector('style[data-wx-anim]')) {
                style.dataset.wxAnim = "1";
                document.head.appendChild(style);
            }
        } else if (status === 1) {
            tag.textContent = '微信(1)';
            tag.style.color = '#07c160';
            // 🔴 关键修改：跳转你要的搜索页格式
            tag.onclick = () => window.open(`https://weread.qq.com/?keyword=` + title, '_blank');
        } else {
            tag.textContent = '微信(0)';
            tag.style.color = '#e53e3e'; // 红色
        }

        // 保存书籍数据
        if (books && books.length > 0) {
            bookData.set(tag, books);
        }

        // 添加鼠标悬停事件
        tag.addEventListener('mouseenter', (e) => {
            const books = bookData.get(tag);
            showTooltip(e, books);
        });

        tag.addEventListener('mouseleave', hideTooltip);

        star.appendChild(tag);
    }

    // 渲染Z-Library标签
    function renderZlibTag(el, status, isbn = null, books = []) {
        const star = el.querySelector('.star');
        if (!star) return;

        const oldTag = star.querySelector('.zlib-tag');
        if (oldTag) oldTag.remove();

        const tag = document.createElement('span');
        tag.className = 'zlib-tag';
        tag.style.marginLeft = '8px';
        tag.style.fontSize = '12px';
        tag.style.fontWeight = 'bold';
        tag.style.cursor = status === 1 ? 'pointer' : 'default';

        if (status === 'loading') {
            tag.textContent = 'Zlib(loading)';
            tag.style.color = '#f59e0b';
            tag.style.animation = 'wx-fade 1s infinite alternate';
        } else if (status === 1) {
            tag.textContent = 'Zlib(1)';
            tag.style.color = '#07c160';
            tag.onclick = () => window.open(`https://zlib.li/s/${isbn}?`, '_blank');
        } else {
            tag.textContent = 'Zlib(0)';
            tag.style.color = '#e53e3e'; // 红色
        }

        // 保存书籍数据
        if (books && books.length > 0) {
            zlibBookData.set(tag, books);
        }

        // 添加鼠标悬停事件
        tag.addEventListener('mouseenter', (e) => {
            const books = zlibBookData.get(tag);
            showTooltip(e, books);
        });

        tag.addEventListener('mouseleave', hideTooltip);

        star.appendChild(tag);
    }

    // 获取豆瓣书籍的ISBN号
    function getBookISBN(bookUrl) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: bookUrl,
                headers: {
                    'User-Agent': navigator.userAgent
                },
                anonymous: false,
                timeout: 10000,
                onload: res => {
                    try {
                        // 从页面中提取ISBN号
                        const html = res.responseText;
                        const isbnMatch = html.match(/"isbn"\s*:\s*"(\d+)"/);
                        if (isbnMatch) {
                            resolve(isbnMatch[1].replace(/-/g, ''));
                        } else {
                            resolve(null);
                        }
                    } catch (e) {
                        resolve(null);
                    }
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null)
            });
        });
    }

    // 查询Z-Library
    function checkZlib(isbn, title, el) {

        const startTime = Date.now();
        const PROXY_CONFIG = {
            type: "socks",
            host: "127.0.0.1",
            port: 10808, // 改成你的本地代理端口
            proxyDNS: true
        };
        GM_xmlhttpRequest({
            method: 'GET',
            url: "https://zlib.li/s/" + isbn,
            ...(PROXY_CONFIG && { proxy: PROXY_CONFIG }),
            timeout: 100000,
            onload: res => {
                const endTime = Date.now();
                const duration = (endTime - startTime) / 1000;
                console.log(`Z-Library请求耗时 (书名: ${title}): ${duration.toFixed(2)}秒`);

                try {
                    const html = res.responseText;
                    // 检查是否有搜索结果
                    if (html.includes(isbn) || html.includes('Results for')) {
                        // 简单解析结果
                        const books = [];
                        // 这里可以根据实际HTML结构解析书籍信息
                        renderZlibTag(el, 1, isbn, books);
                    } else {
                        renderZlibTag(el, 0);
                    }
                } catch (e) {
                    renderZlibTag(el, 0);
                }
            },
            onerror: () => {
                const endTime = Date.now();
                const duration = (endTime - startTime) / 1000;
                console.log(`Z-Library请求耗时 (ISBN: ${isbn}): ${duration.toFixed(2)}秒 (失败)`);
                renderZlibTag(el, 0);
            },
            ontimeout: () => {
                const endTime = Date.now();
                const duration = (endTime - startTime) / 1000;
                console.log(`Z-Library请求耗时 (ISBN: ${isbn}): ${duration.toFixed(2)}秒 (超时)`);
                renderZlibTag(el, 0);
            }
        });
    }

    // 查询书籍
    async function checkBook(title, el) {

        // 先显示加载中
        renderWxTag(el, 'loading');
        renderZlibTag(el, 'loading');
        // 检查Z-Library
        const bookLink = el.querySelector('h2 a')?.href;
        if (bookLink) {
            const isbn = await getBookISBN(bookLink);
            if (isbn) {
                checkZlib(isbn, title, el);
            } else {
                renderZlibTag(el, 0);
            }
        } else {
            renderZlibTag(el, 0);
        }

        // 检查微信读书
        const wxStartTime = Date.now();
        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://weread.qq.com/api/store/search?keyword=${encodeURIComponent(title)}&sid=7mM1yC29b7`,
            headers: {
                'Cookie': WEREAD_COOKIE,
                'Referer': 'https://weread.qq.com/',
                'Origin': 'https://weread.qq.com',
                'User-Agent': navigator.userAgent
            },
            anonymous: false,
            timeout: 100000,
            onload: res => {
                const wxEndTime = Date.now();
                const wxDuration = (wxEndTime - wxStartTime) / 1000;
                console.log(`微信读书请求耗时 (书名: ${title}): ${wxDuration.toFixed(2)}秒`);

                try {
                    const data = JSON.parse(res.responseText);
                    const ebook = data.results?.find(x => x.title === "电子书");
                    const books = ebook?.books || [];

                    // 优化标题匹配逻辑
                    function matchTitle(bookTitle, searchTitle) {
                        if (bookTitle === searchTitle) return true;

                        // 处理包含冒号的情况
                        const bookParts = bookTitle.split(/\s*：\s*/);
                        const searchParts = searchTitle.split(/\s*:\s*/);

                        // 主标题匹配
                        if (bookParts[0] === searchParts[0]) return true;

                        // 副标题匹配
                        if (bookParts.length > 1 && searchParts.length > 1 && bookParts[1] === searchParts[1]) return true;

                        return false;
                    }

                    const matchedBook = books.find(x => matchTitle(x.bookInfo.title, title));

                    if (matchedBook) {
                        renderWxTag(el, 1, title, books);
                    } else {
                        renderWxTag(el, 0, null, books);
                    }
                } catch (e) {
                    renderWxTag(el, 0);
                }
            },
            onerror: () => {
                const wxEndTime = Date.now();
                const wxDuration = (wxEndTime - wxStartTime) / 1000;
                console.log(`微信读书请求耗时 (书名: ${title}): ${wxDuration.toFixed(2)}秒 (失败)`);
                renderWxTag(el, 0);
            },
            ontimeout: () => {
                const wxEndTime = Date.now();
                const wxDuration = (wxEndTime - wxStartTime) / 1000;
                console.log(`微信读书请求耗时 (书名: ${title}): ${wxDuration.toFixed(2)}秒 (超时)`);
                renderWxTag(el, 0);
            }
        });

    }

    async function runQueue() {
        // 没有任务 或 达到最大并行数，直接退出
        if (queue.length === 0 || runningCount >= MAX_PARALLEL) return;

        // 循环取出任务，直到占满并行名额
        while (runningCount < MAX_PARALLEL && queue.length > 0) {
            const task = queue.shift();
            runningCount++; // 标记任务开始运行

            // 执行任务，完成后自动调度下一个
            task().finally(() => {
                runningCount--; // 任务结束，释放名额
                // 保留你原有的延迟逻辑，再执行下一批
                setTimeout(() => runQueue(), DELAY);
            });
        }
    }

    // 扫描图书
    function scanBooks() {
        document.querySelectorAll('.subject-item').forEach(item => {
            const title = item.querySelector('h2 a')?.textContent.trim().replace(/[\n\r]/g, '');
            if (title) {
                queue.push(async () => {
                    await checkBook(title, item);
                });
            }
        });
        runQueue();
    }

    // 初始化
    window.addEventListener('load', () => {
        scanBooks();
        const container = document.querySelector('.subject-list') || document.body;
        new MutationObserver(scanBooks).observe(container, { childList: true, subtree: true });
    });
})();