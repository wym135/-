/* =========================================================
   🏃 跑酷大冒险 v2.0 - 联机技能豪华版
   新增：11种技能系统 | 5种敌人 | HP系统 | PeerJS真双人联机
   ========================================================= */

// ========== 【11种技能系统】 ==========
// cost = 每次释放消耗的金币（从本局获得的 runCoins 里扣，不够扣永久金币兜底）
// isDiamond + diamondPrice = 钻石专属神技，需要用钻石解锁才能装备/使用
const SKILLS = [
    { id:'fire',    name:'火焰冲击', key:'Q', emoji:'🔥', cd:8,  cost:10, color:'#ff6b35', color2:'#d63031', desc:'发射3个火球，摧毁前方最近3个敌人/障碍物！' },
    { id:'ice',     name:'冰霜新星', key:'W', emoji:'❄️', cd:15, cost:25, color:'#74b9ff', color2:'#0984e3', desc:'全屏冰霜爆发！冻结所有敌人+障碍物5秒，可直接穿过！' },
    { id:'bolt',    name:'闪电链',   key:'E', emoji:'⚡', cd:12, cost:18, color:'#fdcb6e', color2:'#f39c12', desc:'召唤闪电，瞬间击杀屏幕内血量最低的3个敌人！' },
    { id:'dash',    name:'加速冲刺', key:'R', emoji:'💨', cd:20, cost:15, color:'#a29bfe', color2:'#6c5ce7', desc:'8秒内速度翻倍！且碰撞免疫（直接撞爆障碍）！' },
    { id:'heal',    name:'治愈光环', key:'T', emoji:'💚', cd:30, cost:30, color:'#55efc4', color2:'#00b894', desc:'恢复1颗心！并获得15秒自动吸附金币效果！' },
    { id:'whirl',   name:'旋风斩',   key:'A', emoji:'🌪️', cd:25, cost:40, color:'#81ecec', color2:'#00cec9', desc:'召唤巨大龙卷风！清除屏幕上所有敌人和障碍物！' },
    { id:'rain',    name:'金币雨',   key:'S', emoji:'💎', cd:40, cost:35, color:'#ffeaa7', color2:'#fdcb6e', desc:'从天上掉落50个金币！疯狂收集吧！（净赚超多！）' },
    { id:'slow',    name:'时光减速', key:'D', emoji:'⏳', cd:22, cost:20, color:'#fab1a0', color2:'#e17055', desc:'10秒内敌人/障碍物速度-70%！轻松躲！' },
    { id:'triple',  name:'三段跳',   key:'F', emoji:'🦘', cd:18, cost:8,  color:'#ff7675', color2:'#d63031', desc:'20秒内支持三段跳！（原本只能二段跳）空中飞舞！' },
    { id:'pet',     name:'召唤宠物', key:'G', emoji:'🐦', cd:45, cost:50, color:'#ff9ff3', color2:'#f368e0', desc:'召唤一只神鸟伙伴，30秒内自动帮你吃金币+啄敌人！' },

    // ===== 钻石专属神级技能（解锁后才能装备） =====
    { id:'meteor',  name:'天神·流星雨', key:'Z', emoji:'☄️', cd:60, cost:100, isDiamond:true, diamondPrice:399, color:'#ff4757', color2:'#6c5ce7', desc:'💎【神技·钻石解锁】召唤10颗天外陨石！全地图敌人+障碍物全部清空！还送30大金币！' },
    { id:'genesis', name:'创世·时光回溯', key:'X', emoji:'🌌', cd:90, cost:150, isDiamond:true, diamondPrice:699, color:'#5f27cd', color2:'#00d2d3', desc:'💎【终极技·钻石解锁】时间倒流！回满5颗心+所有技能CD重置+本局金币翻倍+3秒无敌！' }
];

const SKILL_MAP = {};
SKILLS.forEach(s => SKILL_MAP[s.key.toLowerCase()] = s);
let skillCooldowns = {}; // { fire: 结束时间戳 }
let tripleJumpActive = false;
let petActive = false, pet = { x:0, y:0, angle:0 };

function renderSkillBar() {
    ensureEquippedValid();
    const bar = document.getElementById('skillBar');
    if (!bar) return;
    bar.innerHTML = SKILLS.map(s => {
        const eq = isSkillEquipped(s.id);
        const di = isDiamondSkill(s.id);
        const diUnlocked = isDiamondSkillUnlocked(s.id);
        const cls = [eq?'':'not-equipped', (di && !diUnlocked)?'diamond-locked':''].join(' ');
        return `
        <div class="skill-slot ${cls}" id="slot_${s.id}" data-skill="${s.id}"
             style="--c1:${s.color}22; --c2:${s.color2}22; --shadow:${s.color}55;">
            <span class="skill-key-label">${s.key}</span>
            <span class="skill-emoji">${s.emoji}</span>
            <span class="skill-cost" id="cost_${s.id}">🪙${s.cost}</span>
            <div class="skill-cd-text" id="cd_${s.id}" style="display:none"></div>
        </div>`;
    }).join('');
    bar.querySelectorAll('.skill-slot').forEach(slot => {
        slot.addEventListener('click', () => useSkill(slot.dataset.skill));
    });
}

function updateSkillCDs() {
    const now = Date.now();
    SKILLS.forEach(s => {
        const slot = document.getElementById('slot_' + s.id);
        const cdTxt = document.getElementById('cd_' + s.id);
        const costTxt = document.getElementById('cost_' + s.id);
        if (!slot) return;
        const end = skillCooldowns[s.id] || 0;
        const remain = Math.max(0, end - now);
        if (remain > 0) {
            slot.classList.add('cd');
            const pct = Math.min(100, (remain / (s.cd * 1000)) * 100);
            slot.style.setProperty('--cdh', pct + '%');
            if (cdTxt) { cdTxt.style.display = 'block'; cdTxt.textContent = Math.ceil(remain / 1000); }
            if (costTxt) costTxt.style.display = 'none';
        } else {
            slot.classList.remove('cd');
            slot.style.setProperty('--cdh', '0%');
            if (cdTxt) cdTxt.style.display = 'none';
            if (costTxt) costTxt.style.display = 'block';
        }
    });
}

// 扣金币：优先扣本局 runCoins，不够再扣永久金币 gameData.coins
// 返回 true 表示扣费成功
function paySkillCost(cost) {
    if (runCoins >= cost) { runCoins -= cost; document.getElementById('coins') && (document.getElementById('coins').textContent = runCoins); return true; }
    // 本局金币不够，补差价用永久金币
    const need = cost - runCoins;
    if ((gameData.coins || 0) >= need) {
        runCoins = 0;
        gameData.coins -= need;
        saveData();
        document.getElementById('coins') && (document.getElementById('coins').textContent = runCoins);
        refreshMenuUI();
        return true;
    }
    return false;
}

function useSkill(idOrKey) {
    if (gameState !== 'playing' && !isOnlineHelper) return;
    const s = SKILLS.find(x => x.id === idOrKey) || SKILL_MAP[idOrKey.toLowerCase()];
    if (!s) return;

    // ====== 钻石神技是否解锁？ ======
    if (isDiamondSkill(s.id) && !isDiamondSkillUnlocked(s.id)) {
        showToast(`🔒【${s.name}】是钻石神技，需要先用 💎${s.diamondPrice} 解锁才能用！`, 'error');
        setTimeout(() => unlockDiamondSkill(s.id), 900);
        return;
    }

    // ====== 未装备的技能不让用 ======
    if (!isSkillEquipped(s.id)) {
        showToast(`🚫 ${s.emoji} ${s.name} 本局未装备！去「技能装备」界面选上它吧~`, 'error');
        const slot = document.getElementById('slot_' + s.id);
        if (slot) { slot.animate([{transform:'translateX(0)'},{transform:'translateX(-8px)'},{transform:'translateX(8px)'},{transform:'translateX(0)'}], {duration: 240}); }
        return;
    }

    const now = Date.now();
    if ((skillCooldowns[s.id] || 0) > now) { showToast(`${s.emoji} ${s.name} 还在冷却中！`, ''); return; }

    // 金币检查（联机副手模式：由主机扣费，所以只提示不检查本地；如果主机也收到施放指令再扣一次）
    if (!isOnlineHelper) {
        if (!paySkillCost(s.cost)) { showToast(`🪙 金币不够！施放 ${s.name} 需要 🪙${s.cost}`, 'error'); return; }
    }

    // 💎 皮肤被动：技能冷却减免（神龙大帝-20% / 创世神-30%）
    const cdEff = getSkinEffect(gameData.currentSkin).cdMul || 1;
    skillCooldowns[s.id] = now + Math.floor(s.cd * cdEff * 1000);

    // 联机模式：副手施放技能，通知主机
    if (isOnlineHelper) {
        sendOnline({ type: 'skill', id: s.id });
        showToast(`🎯 已施放 ${s.name}（扣 🪙${s.cost}）给主机！`, 'success');
        return;
    }

    execSkill(s);
}

function execSkill(s) {
    AudioSys.play && AudioSys.play('skill' + (s.id === 'fire' ? '1' : s.id === 'ice' ? '2' : '3'));
    showToast(`${s.emoji} ${s.name} 发动！`, 'gold');
    switch (s.id) {
        case 'fire': {
            for (let i = 0; i < 3; i++) {
                const t = enemies.concat(obstacles).find(e => !e.dead && e.x > player.x + 50 + i * 80);
                if (t) killEnemyOrObstacle(t);
            }
            if (gameData.settings.particlesOn) for (let i = 0; i < 30; i++) particles.push({ x: player.x + 100, y: player.y + 30, vx: 8 + Math.random() * 4, vy: (Math.random() - 0.5) * 4, radius: 4, color: `hsl(${15 + Math.random() * 30},100%,${50 + Math.random() * 20}%)`, life: 1 });
            break;
        }
        case 'ice': {
            addBuff('freeze', 5);
            enemies.forEach(e => { e.frozen = Date.now() + 5000; });
            if (gameData.settings.particlesOn) for (let i = 0; i < 50; i++) particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: 0, vy: 1 + Math.random() * 2, radius: 3, color: `hsl(${200 + Math.random() * 20},100%,75%)`, life: 1.5 });
            break;
        }
        case 'bolt': {
            const victims = enemies.filter(e => !e.dead).sort((a, b) => a.hp - b.hp).slice(0, 3);
            victims.forEach(v => { killEnemyOrObstacle(v, true); if (gameData.settings.particlesOn) for (let i = 0; i < 12; i++) particles.push({ x: v.x + v.width / 2, y: 0, vx: (Math.random() - 0.5) * 5, vy: v.y + Math.random() * v.height, radius: 2, color: '#ffeaa7', life: 0.6 }); });
            break;
        }
        case 'dash': { addBuff('dash', 8); break; }
        case 'heal': {
            if (playerHp < MAX_HP) playerHp++;
            updateHpUI();
            addBuff('magnet', 15);
            break;
        }
        case 'whirl': {
            enemies.concat(obstacles).forEach(x => killEnemyOrObstacle(x));
            if (gameData.settings.particlesOn) for (let i = 0; i < 60; i++) { const a = Math.random() * Math.PI * 2; particles.push({ x: player.x + 20, y: player.y + 30, vx: Math.cos(a) * (3 + Math.random() * 5), vy: Math.sin(a) * (3 + Math.random() * 5), radius: 4, color: `hsl(${170 + Math.random() * 40},100%,${60 + Math.random() * 20}%)`, life: 1.2 }); }
            break;
        }
        case 'rain': {
            for (let i = 0; i < 50; i++) {
                coinList.push({ x: player.x + 100 + Math.random() * 400, y: -50 - Math.random() * 300, vy: 2 + Math.random() * 3, radius: 14, collected: false, angle: Math.random() * 6, isRain: true });
            }
            break;
        }
        case 'slow': { addBuff('slow', 10); break; }
        case 'triple': {
            tripleJumpActive = true;
            setTimeout(() => tripleJumpActive = false, 20 * 1000);
            addBuff('triple', 20);
            break;
        }
        case 'pet': {
            petActive = true;
            pet = { x: player.x, y: player.y, angle: 0, duration: 30 * 1000 };
            addBuff('pet', 30);
            setTimeout(() => petActive = false, 30 * 1000);
            break;
        }
        case 'meteor': { // 💎 天神·流星雨：10颗陨石+清屏+30金币
            showToast('☄️ 天神·流星雨降临！！！', 'success');
            // 30个大金币
            for (let i = 0; i < 30; i++) spawnCoin(canvas.width/2 - 300 + Math.random()*600, 200 + Math.random()*80, true);
            // 画10个陨石（动画：拖尾粒子）
            for (let i = 0; i < 10; i++) {
                setTimeout(() => {
                    const tx = 200 + Math.random()*(canvas.width-300);
                    const ty = 150 + Math.random()*200;
                    for (let k = 0; k < 25; k++) spawnParticle(tx + (Math.random()-0.5)*80, ty + (Math.random()-0.5)*60, (['#ff4757','#ff6b35','#feca57','#5f27cd'])[Math.floor(Math.random()*4)], 5+Math.random()*4);
                    // 音效+震屏
                    AudioSys.play && AudioSys.play('hit');
                }, i * 120);
            }
            if (gameData.settings.shakeOn) {
                setTimeout(() => {
                    const cw = document.querySelector('.canvas-wrapper');
                    cw && cw.classList.add('shake');
                    setTimeout(() => cw && cw.classList.remove('shake'), 600);
                }, 400);
            }
            // 摧毁全部
            setTimeout(() => {
                enemies.forEach(e => { if (!e.isBoss) { e.dead = true; score += e.score; for (let k=0;k<8;k++) spawnParticle(e.x+e.width/2, e.y+e.height/2, e.color, 4); } });
                obstacles.forEach(o => { o.dead = true; for (let k=0;k<8;k++) spawnParticle(o.x+o.width/2, o.y+o.height/2, '#b2bec3', 4); });
            }, 900);
            break;
        }
        case 'genesis': { // 💎 创世·时光回溯：回满+所有技能CD重置+本局金币x2+3秒无敌
            showToast('🌌 创世·时光回溯！全属性爆发！', 'success');
            const maxHp = Math.min(MAX_HP + (getSkinEffect(gameData.currentSkin).extraHp||0), 5);
            playerHp = maxHp; updateHpUI(maxHp);
            // 所有技能CD归零
            SKILLS.forEach(sk => skillCooldowns[sk.id] = 0);
            // 本局金币翻倍
            runCoins = Math.floor(runCoins * 2);
            document.getElementById('coins') && (document.getElementById('coins').textContent = runCoins);
            // 3秒无敌
            player.invul = Date.now() + 3000;
            addBuff('shield', 3); addBuff('magnet', 8);
            // 金色粒子爆闪
            for (let i = 0; i < 100; i++) spawnParticle(player.x, player.y+20, (['#ffeaa7','#feca57','#f368e0','#55efc4','#00d2d3'])[Math.floor(Math.random()*5)], 5+Math.random()*5);
            AudioSys.play && AudioSys.play('revive');
            break;
        }
    }
    renderActiveBuffs();
}

// ========== 【5种敌人系统】 ==========
const ENEMY_TYPES = [
    { type:'imp',   name:'小恶魔',   width:42, height:50, hp:1, color:'#e17055', score:50,  emoji:'👹' },
    { type:'skull', name:'骷髅战士', width:48, height:58, hp:2, color:'#636e72', score:120, emoji:'💀' },
    { type:'ghost', name:'飞行幽灵', width:44, height:42, hp:1, color:'#a29bfe', score:80,  emoji:'👻', isAir:true },
    { type:'bat',   name:'蝙蝠群',   width:38, height:32, hp:1, color:'#2d3436', score:60,  emoji:'🦇', isAir:true, moves:true },
    { type:'boss',  name:'关卡BOSS', width:80, height:90, hp:5, color:'#6c5ce7', score:500, emoji:'👿', isBoss:true, reward:20 }
];

let enemies = [];
let lastBossScore = 0;

function spawnEnemy() {
    let typeIdx = 0;
    if (score < 200) typeIdx = Math.floor(Math.random() * 2); // imp/skull
    else if (score < 600) typeIdx = Math.floor(Math.random() * 4); // + ghost/bat
    else typeIdx = Math.floor(Math.random() * 4);

    // BOSS每1000分出一次
    if (score >= 1000 && lastBossScore + 1000 <= score) {
        typeIdx = 4;
        lastBossScore = Math.floor(score / 1000) * 1000;
    }

    const t = ENEMY_TYPES[typeIdx];
    const y = t.isAir ? GROUND_Y - 120 - Math.random() * 60 : GROUND_Y - t.height + 60;
    enemies.push({
        type: t.type, name: t.name, x: canvas.width + 40, y,
        width: t.width, height: t.height, hp: t.hp, maxHp: t.hp,
        color: t.color, score: t.score, emoji: t.emoji,
        isAir: !!t.isAir, moves: !!t.moves, isBoss: !!t.isBoss,
        reward: t.reward || 3, frozen: 0, hit: 0, dead: false,
        baseY: y, moveSeed: Math.random() * 1000
    });
}

function killEnemyOrObstacle(obj, silent) {
    if (!obj || obj.dead) return;
    obj.dead = true;
    obj.x = -99999;
    if (obj.score) score += obj.score;
    if (obj.reward) {
        for (let i = 0; i < obj.reward; i++) {
            coinList.push({ x: (obj.x || canvas.width / 2) + i * 20, y: (obj.y || 200), radius: 14, collected: false, angle: i * 0.3 });
        }
    }
    if (!silent && gameData.settings.particlesOn) {
        for (let i = 0; i < 10; i++) particles.push({ x: (obj.x || 100) + (obj.width || 30) / 2, y: (obj.y || 100) + (obj.height || 30) / 2, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, radius: 3, color: obj.color || '#fff', life: 0.8 });
    }
}

function drawEnemies() {
    enemies.forEach(e => {
        if (e.dead) return;
        const cx = e.x + e.width / 2;
        const cy = e.y + e.height / 2;
        // 冻结效果
        const frozen = e.frozen > Date.now();
        // 血条（多血量敌人显示）
        if (e.maxHp > 1) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(e.x, e.y - 14, e.width, 6);
            ctx.fillStyle = frozen ? '#74b9ff' : '#55efc4';
            ctx.fillRect(e.x, e.y - 14, e.width * (e.hp / e.maxHp), 6);
        }
        // BOSS专属：带名字
        if (e.isBoss) {
            ctx.fillStyle = 'rgba(253,121,168,0.3)';
            ctx.beginPath(); ctx.arc(cx, cy, e.width * 0.8 + Math.sin(frameCount * 0.15) * 6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fd79a8';
            ctx.font = 'bold 12px Microsoft YaHei';
            ctx.textAlign = 'center';
            ctx.fillText('BOSS: ' + e.name, cx, e.y - 22);
        }
        // 冻结光晕
        if (frozen) {
            ctx.fillStyle = 'rgba(116,185,255,0.35)';
            ctx.fillRect(e.x - 4, e.y - 4, e.width + 8, e.height + 8);
        }
        // 受击闪白
        if (e.hit > Date.now()) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(e.x, e.y, e.width, e.height);
        }
        // 本体（emoji渲染，更可爱）
        ctx.font = `${e.height}px Arial`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(e.emoji, cx, cy + (e.isBoss ? 4 : 0));
    });
}

// ========== 【HP系统】 ==========
const MAX_HP = 3;
let playerHp = MAX_HP;
function updateHpUI(maxHp) {
    const el = document.getElementById('playerHp');
    const chipEl = document.getElementById('hpChip');
    if (el) el.textContent = Math.max(0, playerHp);
    if (chipEl && maxHp && maxHp > MAX_HP) {
        const hearts = chipEl.querySelector('.hp-hearts') || chipEl;
        // 皮肤增加血量时给HP chip加个钻石特效边框提示
        chipEl.style.boxShadow = '0 0 12px rgba(0,210,211,0.5) inset, 0 0 10px rgba(255,107,107,0.3)';
        chipEl.style.border = '1px solid rgba(0,210,211,0.5)';
    } else if (chipEl) {
        chipEl.style.boxShadow = ''; chipEl.style.border = '';
    }
}
function damagePlayer() {
    if (hasBuff('shield')) { delete activeBuffs.shield; renderActiveBuffs(); showToast('🛡️ 护盾挡下攻击！', 'success'); return false; }
    // 💎 雷霆天尊 50% 概率免疫
    const eff = getSkinEffect(gameData.currentSkin);
    if (eff.immuneChance && Math.random() < eff.immuneChance) {
        showToast('⚡ 闪电护体·免疫成功！', 'success');
        // 小特效
        spawnLightning(player.x, player.y);
        return false;
    }
    playerHp--;
    updateHpUI();
    if (gameData.settings.shakeOn) {
        document.querySelector('.canvas-wrapper')?.classList.add('shake');
        setTimeout(() => document.querySelector('.canvas-wrapper')?.classList.remove('shake'), 400);
    }
    AudioSys.play && AudioSys.play('hit');
    if (playerHp <= 0) { hitGameOver(); return true; }
    // 无敌帧 1秒
    player.invul = Date.now() + 1000;
    showToast(`💥 掉血了！剩余 ${playerHp} ❤️`, 'error');
    return true;
}

// ========== 【PeerJS 真双人联机系统】 ==========
let peer = null, myConn = null, myRoomId = '';
let isHost = false, isOnlineHelper = false;

function genRoomId() {
    let r = ''; for (let i = 0; i < 6; i++) r += Math.floor(Math.random() * 10); return r;
}

function setOnlineStatus(icon, title, desc, showRoom) {
    document.getElementById('onlineStatus').classList.remove('hidden');
    document.getElementById('statusIcon').textContent = icon;
    document.getElementById('statusTitle').textContent = title;
    document.getElementById('statusDesc').textContent = desc;
    document.getElementById('roomIdBox').classList.toggle('hidden', !showRoom);
}

function showOnlinePlayers(hostReady, partnerReady) {
    document.getElementById('onlinePlayers').innerHTML = `
        <div class="player-dot ${hostReady ? 'ready' : ''}">🏠 主机 ${hostReady ? '已准备' : '等待中...'}</div>
        <div class="player-dot ${partnerReady ? 'ready' : ''}">🎮 伙伴 ${partnerReady ? '已连接' : '等待中...'}</div>`;
}

function destroyPeer() {
    try { myConn && myConn.close(); } catch(e){}
    try { peer && peer.destroy(); } catch(e){}
    peer = null; myConn = null; isHost = false; isOnlineHelper = false;
    document.getElementById('partnerStatus').classList.add('hidden');
    document.getElementById('onlineStatus').classList.add('hidden');
}

function createRoom() {
    if (typeof Peer === 'undefined') { showToast('❌ 联机库加载失败，请检查网络（需要联网）', 'error'); return; }
    destroyPeer();
    isHost = true;
    const customId = 'parkour_' + genRoomId();
    myRoomId = customId.replace('parkour_', '');
    setOnlineStatus('⏳', '正在创建房间...', '连接 PeerJS 云服务器中...', false);
    try {
        peer = new Peer(customId, { debug: 0 });
    } catch(e) { setOnlineStatus('❌', '创建失败', String(e), false); return; }

    peer.on('open', id => {
        myRoomId = id.replace('parkour_', '');
        document.getElementById('roomIdShow').textContent = myRoomId;
        setOnlineStatus('✅', '房间创建成功！', '把上面的房间号发给朋友，让TA加入吧！', true);
        showOnlinePlayers(true, false);
    });
    peer.on('connection', conn => {
        myConn = conn;
        bindConnEvents(conn);
        setOnlineStatus('🎊', '伙伴已加入！', '准备开始游戏，伙伴可以帮你放技能！', true);
        showOnlinePlayers(true, true);
    });
    peer.on('error', err => {
        setOnlineStatus('❌', '错误', String(err && err.type || err), false);
    });
}

function joinRoom(roomId) {
    if (typeof Peer === 'undefined') { showToast('❌ 联机库加载失败，请检查网络（需要联网）', 'error'); return; }
    if (!/^\d{6}$/.test(roomId)) { showToast('请输入6位纯数字房间号', 'error'); return; }
    destroyPeer();
    isHost = false; isOnlineHelper = true;
    setOnlineStatus('⏳', '正在加入房间...', '连接 PeerJS 云服务器中...', false);
    try {
        peer = new Peer({ debug: 0 });
    } catch(e) { setOnlineStatus('❌', '加入失败', String(e), false); return; }

    peer.on('open', () => {
        try {
            myConn = peer.connect('parkour_' + roomId, { reliable: true });
            bindConnEvents(myConn);
            setOnlineStatus('🔗', '连接中...', '等待主机响应...', false);
            setTimeout(() => { if (myConn && !myConn.open) setOnlineStatus('❌', '加入失败', '连接超时，请检查房间号是否正确', false); }, 10000);
        } catch(e) { setOnlineStatus('❌', '加入失败', String(e), false); }
    });
    peer.on('error', err => {
        setOnlineStatus('❌', '错误', String(err && err.type || err), false);
    });
}

function bindConnEvents(conn) {
    conn.on('open', () => {
        if (!isHost) {
            setOnlineStatus('🎊', '连接成功！', '你是伙伴（副手），按 Q W E R T A S D F G 帮主机放技能！准备开始...', false);
            showOnlinePlayers(true, true);
            document.getElementById('modeLabel').textContent = '🌐 联机模式 · 你是副手（帮忙放技能）';
            document.getElementById('partnerStatus').classList.remove('hidden');
            document.getElementById('partnerName').textContent = '主机';
            setTimeout(() => showScreen('game'), 1000);
            gameState = 'idle';
            canvasMode = 'watching';
        } else {
            setTimeout(() => { sendOnline({ type: 'start' }); showScreen('game'); canvasMode = 'normal'; startGame(); }, 1500);
        }
    });
    conn.on('data', data => {
        if (isHost && data.type === 'skill') {
            const s = SKILLS.find(x => x.id === data.id);
            if (s) { skillCooldowns[s.id] = 0; execSkill(s); }
        }
        if (!isHost && isOnlineHelper && data.type === 'state') {
            // 副手接收主机同步的游戏状态，渲染画面
            onlineState = data.state || {};
            if (onlineState.gameState === 'playing') gameState = 'watching_playing';
            else if (onlineState.gameState === 'over') gameState = 'watching_over';
            document.getElementById('score').textContent = onlineState.score || 0;
            document.getElementById('coins').textContent = onlineState.coins || 0;
            document.getElementById('speedLevel').textContent = onlineState.speedLv || 1;
            if (document.getElementById('playerHp')) document.getElementById('playerHp').textContent = onlineState.hp != null ? onlineState.hp : '?';
            if (onlineState.activeBuffs) { activeBuffs = onlineState.activeBuffs; renderActiveBuffs(); }
            if (onlineState.gameOver) {
                document.getElementById('gameOverScreen').classList.remove('hidden');
                document.getElementById('finalScore').textContent = onlineState.score || 0;
                document.getElementById('finalCoins').textContent = onlineState.coins || 0;
            } else {
                document.getElementById('gameOverScreen').classList.add('hidden');
            }
        }
        if (!isHost && isOnlineHelper && data.type === 'gameover') {
            showToast('🎮 本局结束！得分 ' + (data.score||0), 'gold');
        }
    });
    conn.on('close', () => { showToast('🔌 连接已断开', 'error'); destroyPeer(); });
}

let onlineState = {}; // 副手端存储主机同步来的画面数据

function sendOnline(obj) { try { myConn && myConn.open && myConn.send(obj); } catch(e){} }

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnCreateRoom').onclick = createRoom;
    document.getElementById('btnJoinRoom').onclick = () => joinRoom(document.getElementById('joinRoomId').value.trim());
    document.getElementById('btnCancelOnline').onclick = () => { destroyPeer(); showScreen('menu'); };
    document.getElementById('btnCopyRoom').onclick = () => {
        const txt = document.getElementById('roomIdShow').textContent;
        navigator.clipboard.writeText(txt).then(() => showToast('房间号已复制！' + txt, 'success')).catch(() => showToast('复制失败，请手动抄下来：' + txt, ''));
    };
    document.getElementById('btnSkillLib').onclick = () => { renderSkillLib(); showScreen('skillLib'); };
    document.getElementById('btnEquipSkill').onclick = () => showScreen('equipSkill');
    document.getElementById('btnRecharge').onclick = openRecharge;
    document.getElementById('btnRechargeTop') && (document.getElementById('btnRechargeTop').onclick = openRecharge);
});

let canvasMode = 'normal'; // normal | watching（联机副手看主机画面）

// ========== 【技能图鉴渲染】 ==========
function renderSkillLib() {
    const grid = document.getElementById('skillLibGrid');
    const types = ['伤害','控制','爆发','机动','治疗','清场','资源','控制','机动','辅助','毁灭','神术'];
    grid.innerHTML = SKILLS.map((s,i) => {
        const isDi = !!s.isDiamond;
        const unlocked = isDiamondSkillUnlocked(s.id);
        const cardCls = isDi ? 'skill-card diamond-skill' : 'skill-card';
        let unlockHtml = '';
        if (isDi) {
            if (unlocked) unlockHtml = `<div class="skill-unlocked-badge">✓ 已解锁</div>`;
            else {
                const can = (gameData.diamonds||0) >= (s.diamondPrice||0);
                unlockHtml = `<button class="skill-unlock-btn ${can?'':'disabled'}" data-dskill="${s.id}" ${can?'':'disabled'}>💎 ${s.diamondPrice} 解锁</button>`;
            }
        }
        return `
        <div class="${cardCls}" style="--skill-color:${s.color}; --skill-color2:${s.color2};">
            <div class="skill-header">
                <div class="skill-icon-box">${s.emoji}</div>
                <div class="skill-title-box">
                    <h4>${s.name}</h4>
                    <span class="skill-key">快捷键 ${s.key}</span>
                </div>
            </div>
            <div class="skill-desc">${s.desc}</div>
            <div class="skill-info-row">
                <div class="skill-info-item">冷却：<b>${s.cd}秒</b></div>
                <div class="skill-info-item">消耗：<b style="color:#f7c948">🪙${s.cost}</b></div>
                ${isDi ? `<div class="skill-info-item">解锁：<b style="color:#a29bfe">💎${s.diamondPrice}</b></div>` : `<div class="skill-info-item">类型：<b>${types[i] || '技能'}</b></div>`}
            </div>
            ${unlockHtml}
        </div>`;
    }).join('');
    grid.querySelectorAll('[data-dskill]').forEach(b => {
        b.addEventListener('click', () => unlockDiamondSkill(b.dataset.dskill));
    });
}

// ========== 【系统层：屏幕切换（含新增界面）】 ==========
const screens = {
    menu: document.getElementById('mainMenu'),
    game: document.getElementById('gameScreen'),
    shop: document.getElementById('shopScreen'),
    bag:  document.getElementById('bagScreen'),
    ach:  document.getElementById('achievementScreen'),
    set:  document.getElementById('settingsScreen'),
    help: document.getElementById('helpScreen'),
    online: document.getElementById('onlineScreen'),
    skillLib: document.getElementById('skillLibScreen'),
    equipSkill: document.getElementById('equipSkillScreen'),
    recharge: document.getElementById('rechargeScreen')
};

// ========== 【💎 钻石充值系统（模拟，不真实扣款）】 ==========
const RECHARGE_PACKS = [
    { id:'r1',   rmb:1,   amt:60,   bonus:0,             name:'萌新入门包', from:'#81ecec', to:'#00b894' },
    { id:'r2',   rmb:6,   amt:420,  bonus:30,            name:'超值体验包', from:'#74b9ff', to:'#0984e3' },
    { id:'r3',   rmb:18,  amt:1380, bonus:150, hot:true, name:'热血成长包', from:'#55efc4', to:'#00b894' },
    { id:'r4',   rmb:30,  amt:2400, bonus:360, best:true,name:'经典畅玩包', from:'#ffeaa7', to:'#fdcb6e' },
    { id:'r5',   rmb:68,  amt:5800, bonus:1000,          name:'传说进阶包', from:'#a29bfe', to:'#6c5ce7' },
    { id:'r6',   rmb:128, amt:12800,bonus:2580,          name:'神话豪华包', from:'#ff7675', to:'#d63031' },
    { id:'r7',   rmb:328, amt:35800,bonus:8888,          name:'至尊尊享包', from:'#fd79a8', to:'#e84393' },
    { id:'r8',   rmb:648, amt:78888,bonus:28888,svip:true,name:'创世神·终身包', from:'#6c5ce7', to:'#00d2d3' }
];
let firstRecharge = true; // 演示版：首次充值任意档位额外+100%

function openRecharge() { showScreen('recharge'); renderRecharge(); }
function renderRecharge() {
    const grid = document.getElementById('rechargeGrid');
    const bal = document.getElementById('diamondBalance');
    if (bal) bal.textContent = gameData.diamonds || 0;
    if (!grid) return;
    grid.innerHTML = RECHARGE_PACKS.map(p => {
        let bonus = p.bonus;
        if (firstRecharge) bonus += p.amt; // 首充100%
        const bonusTxt = bonus > 0 ? `赠送 +${bonus.toLocaleString()} 💎` : '';
        const cls = [p.hot?'best-value':'', p.svip?'super-saver':''].join(' ');
        return `
        <div class="recharge-card ${cls}" data-rid="${p.id}" style="--rc-from:${p.from};--rc-to:${p.to};">
            ${p.svip ? `<div class="rc-hot-tag">🔥 顶级推荐</div>` : (p.hot?`<div class="rc-hot-tag">🔥 热门</div>`:'')}
            ${bonus > p.bonus ? `<div class="rc-bonus-tag">首充×2</div>` : (p.best?`<div class="rc-bonus-tag">最超值</div>`:'')}
            <div class="rc-diamond">
                <span class="rc-ico">💎</span>
                <span class="rc-amt">${p.amt.toLocaleString()}</span>
            </div>
            <div class="rc-name">${p.name}</div>
            <div class="rc-bonus">${bonusTxt}</div>
            <div class="rc-price" style="--rc-from:${p.from};--rc-to:${p.to};">¥ ${p.rmb}.00 立即充值</div>
        </div>`;
    }).join('');
    grid.querySelectorAll('.recharge-card').forEach(c => c.addEventListener('click', () => doRecharge(c.dataset.rid)));
}
function doRecharge(packId) {
    const p = RECHARGE_PACKS.find(x => x.id === packId);
    if (!p) return;
    let total = p.amt + p.bonus;
    if (firstRecharge) total += p.amt;
    AudioSys.play && AudioSys.play('buy');
    // 模拟充值成功：撒花动画+钻石飘入余额
    const old = gameData.diamonds || 0;
    gameData.diamonds = old + total;
    saveData();
    // 到账提示
    const firstTxt = firstRecharge ? '（含首充100%翻倍！）' : '';
    showToast(`✅ 充值成功！¥${p.rmb} 获得 💎${total.toLocaleString()} ${firstTxt}`, 'success');
    firstRecharge = false;
    // 更新UI
    const bal = document.getElementById('diamondBalance');
    if (bal) bal.textContent = gameData.diamonds;
    refreshMenuUI();
    renderRecharge();
}

// ========== 【钻石消费：解锁皮肤/技能】 ==========
function buyDiamondSkin(skinId) {
    const s = getSkin(skinId);
    if (!s || !s.diamondPrice) return;
    if (isDiamondSkinUnlocked(skinId)) { useSkin(skinId); return; }
    const price = s.diamondPrice;
    if ((gameData.diamonds||0) < price) {
        showToast(`💎 钻石不够！需要 💎${price}，去充值中心补充钻石吧~`, 'error');
        setTimeout(openRecharge, 900);
        return;
    }
    AudioSys.play && AudioSys.play('buy');
    gameData.diamonds -= price;
    if (!Array.isArray(gameData.unlockedDiamondSkins)) gameData.unlockedDiamondSkins = [];
    gameData.unlockedDiamondSkins.push(skinId);
    gameData.ownedSkins.push(skinId);
    saveData();
    showToast(`🎉 解锁成功！获得神话皮肤【${s.name}】已自动穿上！`, 'success');
    gameData.currentSkin = skinId; saveData();
    renderShop(); refreshMenuUI();
}
function useSkin(skinId) {
    if (!gameData.ownedSkins.includes(skinId)) return;
    gameData.currentSkin = skinId; saveData();
    const s = getSkin(skinId);
    showToast(`✅ 已装备皮肤【${s.name}】`, 'success');
    AudioSys.play && AudioSys.play('click');
    renderShop(); refreshMenuUI();
}

function unlockDiamondSkill(skillId) {
    const s = SKILLS.find(x => x.id === skillId);
    if (!s || !s.isDiamond) return;
    if (isDiamondSkillUnlocked(skillId)) { showToast('这个神技你已经解锁啦！去装备吧~', 'success'); return; }
    const price = s.diamondPrice;
    if ((gameData.diamonds||0) < price) {
        showToast(`💎 钻石不够！解锁【${s.name}】需要 💎${price}，去充值中心吧~`, 'error');
        setTimeout(openRecharge, 900);
        return;
    }
    AudioSys.play && AudioSys.play('buy');
    gameData.diamonds -= price;
    if (!Array.isArray(gameData.unlockedDiamondSkills)) gameData.unlockedDiamondSkills = [];
    gameData.unlockedDiamondSkills.push(skillId);
    saveData();
    showToast(`🌌 恭喜解锁神技【${s.name}】！快去「技能装备」界面把它装上吧！`, 'success');
    renderSkillLib(); renderRecharge(); refreshMenuUI();
}

function isSkillEquipped(id) {
    const arr = gameData.equippedSkills || [];
    return Array.isArray(arr) && arr.includes(id);
}
function isDiamondSkill(id) {
    const s = SKILLS.find(x => x.id === id);
    return s && !!s.isDiamond;
}
function isDiamondSkillUnlocked(id) {
    if (!isDiamondSkill(id)) return true; // 非钻石技能默认解锁
    return Array.isArray(gameData.unlockedDiamondSkills) && gameData.unlockedDiamondSkills.includes(id);
}
function isDiamondSkinUnlocked(id) {
    if (!isDiamondSkin(id)) return true;
    return Array.isArray(gameData.unlockedDiamondSkins) && gameData.unlockedDiamondSkins.includes(id);
}
function ensureEquippedValid() {
    // 校验 equippedSkills 必须是长度2的合法id数组（不合法就用默认），且必须是已解锁的！
    const def = DEFAULT_DATA.equippedSkills;
    if (!Array.isArray(gameData.equippedSkills)) { gameData.equippedSkills = [...def]; }
    // 过滤：必须存在于 SKILLS 且 钻石技能必须已解锁
    let valid = gameData.equippedSkills.filter(id => {
        const sk = SKILLS.find(s=>s.id===id);
        if (!sk) return false;
        if (isDiamondSkill(id) && !isDiamondSkillUnlocked(id)) return false;
        return true;
    }).slice(0, 2);
    while (valid.length < 2) {
        const pick = SKILLS.find(s => !valid.includes(s.id) && !s.isDiamond);
        if (!pick) break;
        valid.push(pick.id);
    }
    gameData.equippedSkills = valid;
    return valid;
}
ensureEquippedValid();

// ========== 【技能装备界面渲染】 ==========
function renderEquipSkill() {
    ensureEquippedValid();
    // 初始化临时选择 = 已保存的
    tempEquipped = [...gameData.equippedSkills];
    _renderEquipAll();
    _bindEquipButtons();
}

function _renderEquipAll() {
    // 上面的两个预览槽
    const preview = document.getElementById('equippedPreview');
    if (preview) {
        preview.innerHTML = '';
        for (let i = 0; i < 2; i++) {
            const id = tempEquipped[i];
            const s = id ? SKILLS.find(x => x.id === id) : null;
            if (s) {
                preview.innerHTML += `
                    <div class="equip-slot" data-es="${i}" style="--slot-color:${s.color};--slot-color1:${s.color}22;--slot-color2:${s.color2}22;--slot-shadow:${s.color}55;">
                        <div class="es-num">${i+1}</div>
                        <button class="es-remove" data-rm="${s.id}" title="移除">×</button>
                        <div class="es-emoji">${s.emoji}</div>
                        <div class="es-name">${s.name}</div>
                        <div class="es-info"><span>⌨️ ${s.key}</span><span>🪙${s.cost}</span><span>⏱️${s.cd}s</span></div>
                    </div>`;
                if (i === 0) preview.innerHTML += `<div class="equip-arrow">⚔️</div>`;
            } else {
                preview.innerHTML += `
                    <div class="equip-slot empty" data-es="${i}">
                        <div class="es-num">${i+1}</div>
                        <div class="es-empty">点击下方卡片装备第${i+1}个技能</div>
                    </div>`;
                if (i === 0) preview.innerHTML += `<div class="equip-arrow">⚔️</div>`;
            }
        }
        preview.querySelectorAll('.es-remove').forEach(b => b.addEventListener('click', e => {
            e.stopPropagation();
            const id = b.dataset.rm;
            tempEquipped = tempEquipped.filter(x => x !== id);
            _renderEquipAll();
        }));
    }
    // 已选数量
    const num = document.getElementById('equippedNum');
    if (num) num.textContent = tempEquipped.length;

    // 主菜单标签
    const tag = document.querySelector('.equip-tag');
    if (tag) tag.textContent = `${tempEquipped.length}/2`;

    // 11个技能卡片网格
    const grid = document.getElementById('equipGrid');
    if (!grid) return;
    const types = ['伤害','控制','爆发','机动','治疗','清场','资源','控制','机动','辅助','毁灭','神术'];
    grid.innerHTML = SKILLS.map((s,i) => {
        const eq = tempEquipped.includes(s.id);
        const full = tempEquipped.length >= 2;
        const dis = !eq && full;
        const isDi = !!s.isDiamond;
        const unlocked = isDiamondSkillUnlocked(s.id);
        const diLocked = isDi && !unlocked;
        let cls = `equip-card ${eq?'equipped':''} ${dis?'disabled':''}`;
        if (isDi) cls += ' diamond-card';
        if (diLocked) cls += ' locked';
        const dataAttr = diLocked ? `data-price="💎${s.diamondPrice}"` : '';
        return `
        <div class="${cls}" ${dataAttr}
             style="--skill-color:${s.color}; --skill-color2:${s.color2};--skill-color1:${s.color}18;--skill-shadow:${s.color}44;"
             data-sid="${s.id}">
            <div class="ech">
                <div class="ec-icon">${s.emoji}</div>
                <div class="ec-title"><h4>${s.name}</h4><span class="ec-key">快捷键 ${s.key}</span></div>
            </div>
            <div class="ec-desc">${s.desc}</div>
            <div class="ec-info-row">
                <span>冷却：<b>${s.cd}秒</b></span>
                <span class="cost">消耗：<b>🪙${s.cost}</b></span>
                ${isDi ? `<span class="cost">解锁：<b style="color:#a29bfe">💎${s.diamondPrice}${unlocked?' ✓':''}</b></span>` : `<span>类型：<b>${types[i]||'技能'}</b></span>`}
            </div>
        </div>`;
    }).join('');
    grid.querySelectorAll('.equip-card').forEach(c => {
        c.addEventListener('click', () => {
            const id = c.dataset.sid;
            // 钻石技能未解锁的点了，跳到充值/解锁
            if (isDiamondSkill(id) && !isDiamondSkillUnlocked(id)) {
                const s = SKILLS.find(x=>x.id===id);
                showToast(`💎【${s?.name}】未解锁！需要 💎${s?.diamondPrice}，去解锁吧~`, 'error');
                setTimeout(() => unlockDiamondSkill(id), 700);
                return;
            }
            if (tempEquipped.includes(id)) {
                tempEquipped = tempEquipped.filter(x => x !== id);
            } else {
                if (tempEquipped.length >= 2) { showToast('最多只能装备2个技能哦！先移除一个~', ''); return; }
                tempEquipped.push(id);
            }
            AudioSys.play && AudioSys.play('click');
            _renderEquipAll();
        });
    });
}

function _bindEquipButtons() {
    const rnd = document.getElementById('btnRandomEquip');
    if (rnd && !rnd._bound) {
        rnd._bound = true;
        rnd.addEventListener('click', () => {
            const pool = [...SKILLS];
            for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [pool[i],pool[j]] = [pool[j],pool[i]]; }
            tempEquipped = pool.slice(0,2).map(s => s.id);
            AudioSys.play && AudioSys.play('click');
            _renderEquipAll();
            showToast('🎲 已随机选择2个技能！', 'success');
        });
    }
    const clr = document.getElementById('btnClearEquip');
    if (clr && !clr._bound) {
        clr._bound = true;
        clr.addEventListener('click', () => {
            tempEquipped = [];
            _renderEquipAll();
            AudioSys.play && AudioSys.play('click');
        });
    }
    const cfm = document.getElementById('btnConfirmEquip');
    if (cfm && !cfm._bound) {
        cfm._bound = true;
        cfm.addEventListener('click', () => {
            if (tempEquipped.length !== 2) { showToast(`请先装备 2 个技能！当前：${tempEquipped.length}/2`, 'error'); return; }
            gameData.equippedSkills = [...tempEquipped];
            saveData();
            AudioSys.play && AudioSys.play('buy');
            const names = gameData.equippedSkills.map(id => SKILLS.find(s=>s.id===id)?.name).join(' + ');
            showToast(`✅ 技能装备成功：${names}`, 'success');
            setTimeout(() => showScreen('menu'), 600);
        });
    }
}

function showScreen(name) {
    Object.values(screens).forEach(s => s && s.classList.remove('active'));
    screens[name] && screens[name].classList.add('active');
    window.scrollTo(0, 0);
    if (name === 'menu') { refreshMenuUI(); destroyPeer(); document.getElementById('modeLabel').textContent = '🎮 单人模式'; }
    if (name === 'shop') renderShop();
    if (name === 'bag')  renderBag();
    if (name === 'ach')  renderAchievements();
    if (name === 'skillLib') renderSkillLib();
    if (name === 'equipSkill') renderEquipSkill();
    if (name === 'recharge') renderRecharge();
    if (name === 'game') {
        ensureEquippedValid();
        if (!isOnlineHelper) startGame();
        renderSkillBar();
    }
}

document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.back || 'menu'));
});

// ========== 【数据系统（保持不变）】 ==========
const SAVE_KEY = 'parkour_deluxe_save_v2';
const DEFAULT_DATA = {
    coins: 50, highScore: 0, totalGames: 0, totalCoinsEarned: 0, maxCombo: 0,
    diamonds: 0, // 💎 钻石：充值获得，用于解锁稀有角色和神级技能
    currentSkin: 'default', ownedSkins: ['default'],
    unlockedDiamondSkins: [], // 已用钻石解锁的皮肤ID
    unlockedDiamondSkills: [], // 已用钻石解锁的钻石专属技能ID
    items: { shield: 2, magnet: 1, revive: 1, double: 1 },
    achievements: {},
    settings: { musicVol: 60, soundVol: 80, musicOn: true, soundOn: true, shakeOn: true, particlesOn: true, defaultDiff: 'normal' },
    currentDiff: 'normal', diffsPlayed: {},
    equippedSkills: ['fire', 'dash'] // 默认装备：🔥火焰冲击 + 💨加速冲刺
};
function loadData() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        let loaded = raw ? JSON.parse(raw) : {};
        const base = structuredClone(DEFAULT_DATA);
        // 合并基础字段
        const data = Object.assign(base, loaded);
        // 确保新增钻石字段一定存在（兼容老存档）
        if (typeof data.diamonds !== 'number') data.diamonds = base.diamonds || 0;
        if (!Array.isArray(data.unlockedDiamondSkins)) data.unlockedDiamondSkins = [];
        if (!Array.isArray(data.unlockedDiamondSkills)) data.unlockedDiamondSkills = [];
        if (!Array.isArray(data.equippedSkills)) data.equippedSkills = [...(base.equippedSkills||[])];
        return data;
    } catch { return structuredClone(DEFAULT_DATA); }
}
function saveData() { localStorage.setItem(SAVE_KEY, JSON.stringify(gameData)); }
let gameData = loadData();
let tempEquipped = []; // 技能装备界面里的临时选择

// ========== 【音乐系统（新增技能音效）】 ==========
const AudioSys = {
    ctx:null, musicGain:null, soundGain:null, musicTimer:null, musicStep:0, bgmOn:false,
    init() { if (this.ctx) return; try { this.ctx = new (window.AudioContext||window.webkitAudioContext)(); this.musicGain = this.ctx.createGain(); this.soundGain = this.ctx.createGain(); this.musicGain.connect(this.ctx.destination); this.soundGain.connect(this.ctx.destination); this.updateVolumes(); } catch(e){} },
    updateVolumes() { if (!this.ctx) return; const s=gameData.settings; this.musicGain.gain.value=(s.musicOn?s.musicVol/100:0)*0.35; this.soundGain.gain.value=(s.soundOn?s.soundVol/100:0); },
    play(type) {
        if (!this.ctx || !gameData.settings.soundOn) return;
        const now = this.ctx.currentTime;
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); o.connect(g); g.connect(this.soundGain);
        const map = {
            jump:[440,660,0.15,'square',0.14], djump:[550,880,0.18,'square',0.14], coin:[880,1320,1760,0.2,'triangle',0.18],
            hit:[180,80,0.35,'sawtooth',0.22], shield:[300,500,700,0.25,'sine',0.18], buy:[523,659,784,0.3,'triangle',0.18],
            click:[800,0.05,'sine',0.08], ach:[523,659,784,1046,0.5,'triangle',0.22], gameover:[400,300,200,100,0.6,'sawtooth',0.2],
            revive:[400,600,800,1000,0.4,'sine',0.2],
            skill1:[200,400,800,600,0.28,'sawtooth',0.18],
            skill2:[600,500,400,500,600,0.35,'sine',0.18],
            skill3:[1200,900,1500,1100,0.3,'triangle',0.18]
        };
        const p = map[type] || map.click;
        const freqs = Array.isArray(p[0]) ? p : p.filter(x => typeof x === 'number' && x > 20);
        const dur = typeof p[p.length-2] === 'number' && p[p.length-2] < 1 ? p[p.length-2] : 0.15;
        const wave = typeof p[p.length-2] === 'string' ? p[p.length-2] : (typeof p[p.length-3] === 'string' ? p[p.length-3] : 'square');
        const vol = p[p.length-1];
        o.type = wave; g.gain.setValueAtTime(vol, now);
        const step = dur / freqs.length;
        freqs.forEach((f, i) => o.frequency.setValueAtTime(f, now + i * step));
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        o.start(now); o.stop(now + dur + 0.02);
    },
    startBGM() {
        if (!this.ctx || !gameData.settings.musicOn || this.bgmOn) return;
        this.bgmOn = true; this.musicStep = 0;
        const melody = [523,587,659,698,784,880,988,1046,988,880,784,698,659,587,523,392,440,494,523,587,659,698,784,659,523,587,659,587,523,494,440,392];
        const bass = [130,130,174,174,196,196,130,130];
        const playNote = () => {
            if (!this.bgmOn || !gameData.settings.musicOn) return;
            const now = this.ctx.currentTime;
            const o1 = this.ctx.createOscillator(); const g1 = this.ctx.createGain();
            o1.type = 'triangle'; o1.frequency.value = melody[this.musicStep % melody.length];
            o1.connect(g1); g1.connect(this.musicGain);
            g1.gain.setValueAtTime(0.1, now); g1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            o1.start(now); o1.stop(now + 0.28);
            if (this.musicStep % 4 === 0) {
                const o2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
                o2.type = 'sine'; o2.frequency.value = bass[(this.musicStep / 4) % bass.length | 0];
                o2.connect(g2); g2.connect(this.musicGain);
                g2.gain.setValueAtTime(0.12, now); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
                o2.start(now); o2.stop(now + 1);
            }
            this.musicStep++;
        };
        playNote(); this.musicTimer = setInterval(playNote, 260);
    },
    stopBGM() { this.bgmOn = false; if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } },
    toggleMusic() { gameData.settings.musicOn = !gameData.settings.musicOn; saveData(); this.updateVolumes(); if (gameData.settings.musicOn) this.startBGM(); else this.stopBGM(); return gameData.settings.musicOn; },
    toggleSound() { gameData.settings.soundOn = !gameData.settings.soundOn; saveData(); this.updateVolumes(); return gameData.settings.soundOn; }
};

// ========== 【皮肤系统（含钻石专属）】 ==========
// rarity: common(金币) / rare(金币) / epic(金币) / legend(金币) / mythic(钻石专属/神话) / transcendent(钻石专属/至尊)
// diamondPrice: 用钻石解锁的价格（不传则用金币price解锁）
// effect: 皮肤附加被动效果
const SKINS = [
    { id:'default', name:'经典少年', price:0, rarity:'common', desc:'默认皮肤，阳光帅气！', colors:{ body:['#ff6b35','#e55a2b'], pants:'#3d5a80', skin:'#ffd4b8', hair:'#2c1810' } },
    { id:'ninja', name:'暗夜忍者', price:200, rarity:'rare', desc:'神出鬼没的忍者！', colors:{ body:['#2c3e50','#1a252f'], pants:'#1a1a1a', skin:'#f5d6ba', hair:'#000' } },
    { id:'robot', name:'机械战士', price:500, rarity:'epic', desc:'来自未来的机械！', colors:{ body:['#95a5a6','#7f8c8d'], pants:'#34495e', skin:'#bdc3c7', hair:'#2c3e50' } },
    { id:'fire', name:'烈焰勇者', price:800, rarity:'epic', desc:'燃烧的冒险之心！', colors:{ body:['#e74c3c','#c0392b'], pants:'#8b0000', skin:'#ffd4b8', hair:'#e67e22' } },
    { id:'ice', name:'冰霜王子', price:800, rarity:'epic', desc:'冰封一切的力量！', colors:{ body:['#3498db','#2980b9'], pants:'#1e3a8a', skin:'#e0f7fa', hair:'#a8e6cf' } },
    { id:'rainbow', name:'彩虹传说', price:2000, rarity:'legend', desc:'传说中的彩虹之力！', colors:{ body:['#ff6b6b','#feca57'], pants:'#48dbfb', skin:'#ffe4c4', hair:'#ff9ff3' } },

    // ===== 钻石专属 · 神话级 =====
    { id:'phoenix', name:'凤凰神尊', diamondPrice:299, rarity:'mythic', desc:'🔥【神话】浴火重生！死亡后自动复活1次（额外复活卡）+ 所有得分+20%！',
      effect:{ extraRevive:true, scoreMul:1.2 },
      colors:{ body:['#ff9f43','#ee5253'], pants:'#5f27cd', skin:'#ffeaa7', hair:'#feca57' } },
    { id:'thunder', name:'雷霆天尊', diamondPrice:399, rarity:'mythic', desc:'⚡【神话】闪电护体！被障碍/敌人撞中有50%概率免疫！+初始金币+50！',
      effect:{ immuneChance:0.5, startCoins:50 },
      colors:{ body:['#feca57','#ff9f43'], pants:'#222f3e', skin:'#ffd4b8', hair:'#00d2d3' } },
    { id:'dragon', name:'神龙大帝', diamondPrice:599, rarity:'transcendent', desc:'🐉【至尊·钻石限定】龙族血脉！开局自带2个护盾+磁铁+30%金币加成+技能CD-20%！',
      effect:{ startShields:2, startMagnet:true, coinMul:1.3, cdMul:0.8 },
      colors:{ body:['#0abde3','#10ac84'], pants:'#222f3e', skin:'#ffeaa7', hair:'#ee5253' } },
    { id:'cosmos', name:'宇宙创世神', diamondPrice:999, rarity:'transcendent', desc:'🌌【至尊·最稀有】创世神之力！以上所有神话特效全部拥有 + 开局满血+2心（上限5心）！',
      effect:{ extraRevive:true, scoreMul:1.2, immuneChance:0.5, startCoins:100, startShields:2, startMagnet:true, coinMul:1.5, cdMul:0.7, extraHp:2 },
      colors:{ body:['#5f27cd','#341f97'], pants:'#000000', skin:'#c8d6e5', hair:'#ff9ff3' } }
];
function getSkin(id) { return SKINS.find(x=>x.id===id)||SKINS[0]; }
function getSkinColors(id) { return getSkin(id).colors; }
function getSkinEffect(id) { return getSkin(id).effect || {}; }
function isDiamondSkin(id) { return !!getSkin(id).diamondPrice; }
function rarityTag(r) {
    return {
        common:{ text:'普通', cls:'common-tag' },
        rare:{ text:'稀有', cls:'rare-tag' },
        epic:{ text:'史诗', cls:'epic-tag' },
        legend:{ text:'传说', cls:'legend-tag' },
        mythic:{ text:'神话·💎', cls:'mythic-tag' },
        transcendent:{ text:'至尊·💎', cls:'transcendent-tag' }
    }[r] || { text:'普通', cls:'' };
}

// ========== 【道具系统】 ==========
const ITEMS = { shield:{ name:'护盾', emoji:'🛡️', price:80, desc:'抵挡一次伤害' }, magnet:{ name:'磁铁', emoji:'🧲', price:120, desc:'10秒自动吸附金币' }, revive:{ name:'复活卡', emoji:'💖', price:300, desc:'死亡原地复活1次' }, double:{ name:'双倍金币', emoji:'💰', price:150, desc:'本局金币x2' } };
let activeBuffs = {};
function addBuff(name, duration) { activeBuffs[name] = { time:Date.now(), end:Date.now()+duration*1000, dur:duration }; renderActiveBuffs(); }
function hasBuff(name) { const b = activeBuffs[name]; if (!b) return false; if (Date.now()>b.end) { delete activeBuffs[name]; renderActiveBuffs(); return false; } return true; }
function useItem(key) {
    if (gameState !== 'playing') return;
    if (!gameData.items[key] || gameData.items[key] <= 0) { showToast('没有这个道具哦~', 'error'); return; }
    if (key === 'shield') { if (hasBuff('shield')) return; addBuff('shield', 9999999); gameData.items[key]--; showToast('🛡️ 护盾激活！', 'success'); }
    else if (key === 'magnet') { if (hasBuff('magnet')) return; addBuff('magnet', 10); gameData.items[key]--; showToast('🧲 磁铁激活！', 'success'); }
    else if (key === 'revive') { addBuff('revive', 9999999); gameData.items[key]--; showToast('💖 复活卡装备！', 'success'); }
    else if (key === 'double') { if (hasBuff('double')) return; addBuff('double', 9999999); gameData.items[key]--; document.getElementById('doubleCoinChip').style.display = 'flex'; showToast('💰 双倍激活！', 'gold'); }
    saveData(); refreshItemCounts();
}
function renderActiveBuffs() {
    const box = document.getElementById('activeBuffs'); if (!box) return; box.innerHTML = '';
    Object.keys(activeBuffs).forEach(k => {
        const it = ITEMS[k];
        if (k === 'freeze') box.innerHTML += `<div class="buff-chip" style="background:linear-gradient(135deg,#74b9ff,#0984e3)">❄️ 冻结 ${Math.ceil(Math.max(0,(activeBuffs[k].end-Date.now())/1000))}s</div>`;
        else if (k === 'dash') box.innerHTML += `<div class="buff-chip" style="background:linear-gradient(135deg,#a29bfe,#6c5ce7)">💨 冲刺 ${Math.ceil(Math.max(0,(activeBuffs[k].end-Date.now())/1000))}s</div>`;
        else if (k === 'slow') box.innerHTML += `<div class="buff-chip" style="background:linear-gradient(135deg,#fab1a0,#e17055)">⏳ 减速 ${Math.ceil(Math.max(0,(activeBuffs[k].end-Date.now())/1000))}s</div>`;
        else if (k === 'triple') box.innerHTML += `<div class="buff-chip" style="background:linear-gradient(135deg,#ff7675,#d63031)">🦘 三段跳 ${Math.ceil(Math.max(0,(activeBuffs[k].end-Date.now())/1000))}s</div>`;
        else if (k === 'pet') box.innerHTML += `<div class="buff-chip" style="background:linear-gradient(135deg,#ff9ff3,#f368e0)">🐦 宠物 ${Math.ceil(Math.max(0,(activeBuffs[k].end-Date.now())/1000))}s</div>`;
        else if (it) {
            const sec = (k==='magnet') ? Math.max(0,Math.ceil((activeBuffs[k].end-Date.now())/1000)) : null;
            box.innerHTML += `<div class="buff-chip">${it.emoji} ${it.name}${sec?` ${sec}s`:''}</div>`;
        }
    });
}
function refreshItemCounts() { ['Shield','Magnet','Revive','Double'].forEach(k => { const el = document.getElementById('count'+k); if (el) el.textContent = gameData.items[k.toLowerCase()]||0; }); }
document.querySelectorAll('.item-slot').forEach(slot => slot.addEventListener('click', () => useItem(slot.dataset.item)));

// ========== 【成就系统】 ==========
const ACHIEVEMENTS = [
    { id:'first_run', name:'初出茅庐', icon:'🏁', desc:'完成第一局游戏', reward:30, check:d=>d.totalGames>=1 },
    { id:'coin_100', name:'小小富翁', icon:'💵', desc:'累计获得100金币', reward:50, check:d=>d.totalCoinsEarned>=100 },
    { id:'coin_1000', name:'金币大亨', icon:'💎', desc:'累计获得1000金币', reward:200, check:d=>d.totalCoinsEarned>=1000 },
    { id:'score_500', name:'跑酷新手', icon:'🥉', desc:'单局得分达500', reward:60, check:d=>d.highScore>=500 },
    { id:'score_2000', name:'跑酷达人', icon:'🥈', desc:'单局得分达2000', reward:200, check:d=>d.highScore>=2000 },
    { id:'score_5000', name:'传奇跑者', icon:'🥇', desc:'单局得分达5000', reward:500, check:d=>d.highScore>=5000 },
    { id:'games_10', name:'坚持不懈', icon:'💪', desc:'累计游戏10局', reward:80, check:d=>d.totalGames>=10 },
    { id:'games_50', name:'游戏狂热', icon:'🎮', desc:'累计游戏50局', reward:300, check:d=>d.totalGames>=50 },
    { id:'buy_skin', name:'时尚达人', icon:'👕', desc:'购买一款皮肤', reward:100, check:d=>d.ownedSkins.length>=2 },
    { id:'all_diff', name:'全能战士', icon:'⚔️', desc:'在三种难度各玩一局', reward:150, check:d=>d.diffsPlayed?.easy&&d.diffsPlayed?.normal&&d.diffsPlayed?.hard },
    { id:'kill_boss', name:'屠龙勇士', icon:'🐉', desc:'击杀第一个关卡BOSS', reward:200, check:d=>d.bossKilled>=1 }
];
function checkAchievements() {
    ACHIEVEMENTS.forEach(a => { if (!gameData.achievements[a.id] && a.check(gameData)) { gameData.achievements[a.id]=true; gameData.coins+=a.reward; AudioSys.play('ach'); showToast(`🏅 成就解锁：${a.name}！+🪙${a.reward}`, 'gold'); } });
    saveData();
}
function renderAchievements() {
    const grid = document.getElementById('achievementGrid'); const prog = document.getElementById('achProgress'); let done = 0;
    grid.innerHTML = ACHIEVEMENTS.map(a => { const u = !!gameData.achievements[a.id]; if (u) done++; return `
        <div class="ach-card ${u?'unlocked':'locked'}">
            <div class="ach-icon">${a.icon}</div>
            <div class="ach-info"><h4>${a.name}${u?' ✓':''}</h4>
                <div class="ach-desc">${a.desc}</div>
                <div class="ach-progress">${u?'✔ 已完成  +🪙'+a.reward:'未完成  奖励：🪙'+a.reward}</div>
            </div></div>`; }).join('');
    prog.textContent = `${done}/${ACHIEVEMENTS.length}`;
}

// ========== 【商店 & 背包】 ==========
function renderShop() {
    document.getElementById('shopCoins').textContent = gameData.coins;
    const shopDiam = document.getElementById('shopDiamonds');
    if (shopDiam) shopDiam.textContent = (gameData.diamonds||0).toLocaleString();
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.shop-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(btn.dataset.tab === 'skins' ? 'tabSkins' : 'tabItems').classList.remove('hidden');
        };
    });
    const skinsGrid = document.getElementById('skinsGrid'); skinsGrid.innerHTML = '';
    SKINS.forEach(skin => {
        const diamondSkin = !!skin.diamondPrice;
        const diamondUnlocked = isDiamondSkinUnlocked(skin.id);
        const owned = gameData.ownedSkins.includes(skin.id); const equipped = gameData.currentSkin === skin.id;
        const tag = rarityTag(skin.rarity); const c = skin.colors;
        const miniSkin = `<div class="si-preview skin-mini"><svg viewBox="0 0 40 60" width="70" height="100"><circle cx="20" cy="12" r="10" fill="${c.skin}"/><rect x="10" y="22" width="20" height="20" fill="${c.body[0]}"/><rect x="11" y="42" width="7" height="15" fill="${c.pants}"/><rect x="22" y="42" width="7" height="15" fill="${c.pants}"/><rect x="2" y="24" width="6" height="15" fill="${c.skin}"/><rect x="32" y="24" width="6" height="15" fill="${c.skin}"/></svg></div>`;
        const stateTag = equipped ? `<span class="si-tag use-tag">使用中</span>` : owned ? `<span class="si-tag owned-tag">已拥有</span>` : tag.text ? `<span class="si-tag ${tag.cls}">${tag.text}</span>` : '';
        let cardCls = `shop-item ${equipped?'equipped':owned?'owned':''} ${skin.rarity==='mythic'?'mythic':skin.rarity==='transcendent'?'transcendent':''}`;
        let content = '';
        if (diamondSkin) {
            // 钻石皮肤
            content += `${stateTag}${diamondUnlocked || owned ? '' : `<div class="diamond-lock-mark">🔒 💎${skin.diamondPrice}</div>`}`;
            content += `${miniSkin}<h4>${skin.name}</h4><div class="si-desc">${skin.desc}</div>`;
            let btnHtml = '';
            if (equipped) btnHtml = `<button class="si-action" disabled>使用中</button>`;
            else if (diamondUnlocked || owned) btnHtml = `<button class="si-action btn-diamond-buy" data-diamond-skin="${skin.id}">立即装备</button>`;
            else {
                const can = (gameData.diamonds||0) >= skin.diamondPrice;
                btnHtml = `<div class="si-price diamond-price">💎 ${skin.diamondPrice}</div><button class="si-action btn-diamond-buy ${can?'':'disabled'}" data-diamond-skin="${skin.id}" ${can?'':'disabled'}>💎 解锁并装备</button>`;
            }
            content += btnHtml;
        } else {
            // 金币皮肤（原有逻辑）
            content += stateTag + miniSkin + `<h4>${skin.name}</h4><div class="si-desc">${skin.desc}</div>`;
            const actionText = equipped ? '使用中' : owned ? '装备' : `🪙 ${skin.price}`;
            const disabled = (!owned && gameData.coins < skin.price) || equipped;
            content += `${!equipped&&!owned?`<div class="si-price">🪙 ${skin.price}</div>`:''}<button class="si-action" ${disabled?'disabled':''} data-skin="${skin.id}">${actionText}</button>`;
        }
        skinsGrid.innerHTML += `<div class="${cardCls}" ${!diamondSkin?`data-skin="${skin.id}"`:''}>${content}</div>`;
    });
    // 绑定金币皮肤按钮
    skinsGrid.querySelectorAll('[data-skin]').forEach(el => {
        const id = el.dataset.skin; const btn = el.querySelector('.si-action');
        btn && btn.addEventListener('click', e => { e.stopPropagation(); buyOrEquipSkin(id); });
    });
    // 绑定钻石皮肤按钮
    skinsGrid.querySelectorAll('[data-diamond-skin]').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); buyDiamondSkin(btn.dataset.diamondSkin); });
    });
    const itemsGrid = document.getElementById('itemsGrid'); itemsGrid.innerHTML = '';
    Object.keys(ITEMS).forEach(k => {
        const it = ITEMS[k];
        itemsGrid.innerHTML += `<div class="shop-item" data-buyitem="${k}"><div class="si-preview" style="font-size:3rem">${it.emoji}</div><h4>${it.name}</h4><div class="si-desc">${it.desc}</div><div class="si-price">🪙 ${it.price}</div><button class="si-action" ${gameData.coins<it.price?'disabled':''}>购买 🪙${it.price}</button></div>`;
    });
    itemsGrid.querySelectorAll('[data-buyitem]').forEach(el => {
        const k = el.dataset.buyitem; const btn = el.querySelector('.si-action');
        btn.addEventListener('click', e => {
            e.stopPropagation(); const it = ITEMS[k];
            if (gameData.coins < it.price) { showToast('金币不够啦~', 'error'); return; }
            confirmBuy(`购买 ${it.emoji} ${it.name}？`, `花费 🪙${it.price} 购买此道具`, () => {
                gameData.coins -= it.price; gameData.items[k] = (gameData.items[k]||0)+1; saveData(); AudioSys.play('buy');
                showToast(`购买成功！+1 ${it.name}`, 'success'); renderShop();
            });
        });
    });
}
function buyOrEquipSkin(id) {
    const skin = SKINS.find(s=>s.id===id); if (gameData.currentSkin === id) return;
    if (gameData.ownedSkins.includes(id)) { gameData.currentSkin = id; saveData(); AudioSys.play('click'); showToast(`已装备「${skin.name}」！`, 'success'); renderShop(); refreshMenuUI(); }
    else {
        if (gameData.coins < skin.price) { showToast('金币不够哦~ 快去玩游戏赚金币吧！', 'error'); return; }
        confirmBuy(`购买「${skin.name}」？`, `花费 🪙${skin.price}，是否确认购买？`, () => {
            gameData.coins -= skin.price; gameData.ownedSkins.push(id); gameData.currentSkin = id; saveData(); AudioSys.play('buy'); checkAchievements();
            showToast(`购买成功！已装备「${skin.name}」`, 'success'); renderShop(); refreshMenuUI();
        });
    }
}
function renderBag() {
    document.getElementById('bagCoins').textContent = gameData.coins;
    const grid = document.getElementById('bagGrid'); grid.innerHTML = '';
    Object.keys(ITEMS).forEach(k => { const it = ITEMS[k]; const n = gameData.items[k]||0; grid.innerHTML += `<div class="bag-card"><div class="bc-emoji">${it.emoji}</div><h4>${it.name}</h4><div class="bc-desc">${it.desc}</div><div class="bc-count">×${n}</div></div>`; });
    const skin = SKINS.find(s=>s.id===gameData.currentSkin)||SKINS[0]; const c = skin.colors;
    document.getElementById('currentSkinDisplay').innerHTML = `<svg viewBox="0 0 40 60" width="80" height="120"><circle cx="20" cy="12" r="10" fill="${c.skin}"/><rect x="5" y="2" width="30" height="8" fill="${c.hair}" rx="4"/><circle cx="16" cy="11" r="1.5" fill="#222"/><circle cx="24" cy="11" r="1.5" fill="#222"/><path d="M 16 16 Q 20 19 24 16" stroke="#222" stroke-width="1.5" fill="none"/><rect x="10" y="22" width="20" height="20" fill="${c.body[0]}" rx="2"/><rect x="11" y="42" width="7" height="15" fill="${c.pants}" rx="1"/><rect x="22" y="42" width="7" height="15" fill="${c.pants}" rx="1"/><rect x="2" y="24" width="6" height="15" fill="${c.skin}" rx="2"/><rect x="32" y="24" width="6" height="15" fill="${c.skin}" rx="2"/></svg><div><h3 style="margin:0 0 6px 0;color:${skin.rarity==='legend'?'#fd79a8':skin.rarity==='epic'?'#f7c948':skin.rarity==='rare'?'#a29bfe':'#fff'}">${skin.name}</h3><p style="opacity:0.7;margin:0;font-size:0.9rem">${skin.desc}</p><p style="margin-top:6px;font-size:0.8rem;color:#55efc4">✓ 已装备</p></div>`;
}

// ========== 【Toast & 确认弹窗】 ==========
let toastTimer = null;
function showToast(msg, type = '') {
    const t = document.getElementById('toast'); if (!t) return;
    t.className = 'toast ' + type; t.textContent = msg; t.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2400);
}
let confirmCb = null;
function confirmBuy(title, desc, cb) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmDesc').textContent = desc;
    document.getElementById('confirmModal').classList.remove('hidden');
    confirmCb = cb;
}
document.getElementById('confirmCancel').onclick = () => { document.getElementById('confirmModal').classList.add('hidden'); confirmCb = null; };
document.getElementById('confirmOk').onclick = () => { document.getElementById('confirmModal').classList.add('hidden'); if (confirmCb) confirmCb(); confirmCb = null; };

// ========== 【难度 & 主菜单】 ==========
const DIFFS = { easy:{name:'简单', speedMul:0.7, obsMul:1.3, coinMul:1.0}, normal:{name:'普通', speedMul:1.0, obsMul:1.0, coinMul:1.0}, hard:{name:'困难', speedMul:1.3, obsMul:0.7, coinMul:1.5} };
let selectedDiff = gameData.settings.defaultDiff || 'normal';
function refreshMenuUI() {
    ensureEquippedValid();
    document.getElementById('menuCoins').textContent = gameData.coins;
    document.getElementById('menuDiamonds') && (document.getElementById('menuDiamonds').textContent = (gameData.diamonds||0).toLocaleString());
    document.getElementById('menuHighScore').textContent = gameData.highScore;
    const lv = Math.min(99, 1 + Math.floor((gameData.highScore||0)/500));
    document.getElementById('playerLevel').textContent = 'Lv.' + lv;
    document.getElementById('diffLabel').textContent = DIFFS[selectedDiff]?.name || '普通';
    document.getElementById('musicIcon').textContent = gameData.settings.musicOn ? '🔊' : '🔇';
    document.getElementById('soundIcon').textContent = gameData.settings.soundOn ? '🔊' : '🔇';
    const tag = document.querySelector('.equip-tag');
    if (tag) tag.textContent = `${(gameData.equippedSkills||[]).length}/2`;
}
document.getElementById('btnDifficulty').onclick = () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b.dataset.diff === selectedDiff));
    document.getElementById('diffModal').classList.remove('hidden');
};
document.querySelectorAll('.diff-btn').forEach(b => b.onclick = () => { document.querySelectorAll('.diff-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); selectedDiff = b.dataset.diff; });
document.getElementById('confirmDiff').onclick = () => {
    document.getElementById('diffModal').classList.add('hidden');
    gameData.currentDiff = selectedDiff; saveData(); refreshMenuUI();
    showToast(`已选择「${DIFFS[selectedDiff].name}」难度`, 'success');
};

// ========== 【设置】 ==========
function initSettingsUI() {
    const s = gameData.settings;
    document.getElementById('musicVol').value = s.musicVol; document.getElementById('musicVolVal').textContent = s.musicVol+'%';
    document.getElementById('soundVol').value = s.soundVol; document.getElementById('soundVolVal').textContent = s.soundVol+'%';
    document.getElementById('shakeOn').checked = s.shakeOn; document.getElementById('particlesOn').checked = s.particlesOn;
    document.getElementById('defaultDiff').value = s.defaultDiff;
    document.getElementById('musicVol').oninput = e => { s.musicVol = +e.target.value; document.getElementById('musicVolVal').textContent = s.musicVol+'%'; AudioSys.updateVolumes(); saveData(); };
    document.getElementById('soundVol').oninput = e => { s.soundVol = +e.target.value; document.getElementById('soundVolVal').textContent = s.soundVol+'%'; AudioSys.updateVolumes(); saveData(); };
    document.getElementById('shakeOn').onchange = e => { s.shakeOn = e.target.checked; saveData(); };
    document.getElementById('particlesOn').onchange = e => { s.particlesOn = e.target.checked; saveData(); };
    document.getElementById('defaultDiff').onchange = e => { s.defaultDiff = e.target.value; selectedDiff = e.target.value; saveData(); refreshMenuUI(); };
    document.getElementById('btnReset').onclick = () => {
        if (!confirm('确定要清除所有游戏数据吗？\n（金币、皮肤、成就、进度都会消失！）')) return;
        localStorage.removeItem(SAVE_KEY); gameData = structuredClone(DEFAULT_DATA); saveData(); initSettingsUI(); refreshMenuUI(); showToast('数据已重置', 'success');
    };
}

// ========== 【菜单按钮绑定】 ==========
document.getElementById('btnStart').onclick = () => { AudioSys.init(); AudioSys.play('click'); isOnlineHelper = false; showScreen('game'); };
document.getElementById('btnOnline').onclick = () => { AudioSys.init(); AudioSys.play('click'); showScreen('online'); };
document.getElementById('btnShop').onclick = () => { AudioSys.play('click'); showScreen('shop'); };
document.getElementById('btnItems').onclick = () => { AudioSys.play('click'); showScreen('bag'); };
document.getElementById('btnAchievements').onclick = () => { AudioSys.play('click'); showScreen('ach'); };
document.getElementById('btnSettings').onclick = () => { AudioSys.play('click'); initSettingsUI(); showScreen('set'); };
document.getElementById('btnHelp').onclick = () => { AudioSys.play('click'); showScreen('help'); };
document.getElementById('btnMusic').onclick = () => { AudioSys.init(); const on = AudioSys.toggleMusic(); document.getElementById('musicIcon').textContent = on ? '🔊' : '🔇'; };
document.getElementById('btnSound').onclick = () => { AudioSys.init(); const on = AudioSys.toggleSound(); document.getElementById('soundIcon').textContent = on ? '🔊' : '🔇'; };

// ========== 【🎮 核心游戏逻辑（新：更大画布+敌人+技能+HP）】 ==========
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const GROUND_Y = canvas.height - 70; // 大画布
const GRAVITY = 0.65;
const JUMP_FORCE = -15;
const DOUBLE_JUMP_FORCE = -13;
const TRIPLE_JUMP_FORCE = -11;
const BASE_SPEED = 6;
const MAX_SPEED = 16;
const SPEED_INCREMENT = 0.0014;

let gameState = 'idle';
let score = 0, runCoins = 0, frameCount = 0, gameSpeed = BASE_SPEED;
let obstacles = [], coinList = [], particles = [], clouds = [], buildings = [], groundTiles = [];
let sessionDiff = 'normal', combo = 0;

const player = {
    x: 120, y: GROUND_Y, width: 44, height: 66,
    vy: 0, onGround: true, jumpCount: 0, runFrame: 0, invul: 0,
    reset() { this.y = GROUND_Y; this.vy = 0; this.onGround = true; this.jumpCount = 0; this.runFrame = 0; this.invul = 0; },
    jump() {
        const max = tripleJumpActive ? 3 : 2;
        if (this.jumpCount < max) {
            if (this.jumpCount === 0) this.vy = JUMP_FORCE;
            else if (this.jumpCount === 1) this.vy = DOUBLE_JUMP_FORCE;
            else this.vy = TRIPLE_JUMP_FORCE;
            this.onGround = false; this.jumpCount++;
            AudioSys.play(this.jumpCount === 1 ? 'jump' : 'djump');
            if (gameData.settings.particlesOn) createJumpParticles(this.x+this.width/2, this.y+this.height, this.jumpCount>1);
        }
    },
    update() {
        this.vy += GRAVITY; this.y += this.vy;
        if (this.y >= GROUND_Y) { this.y = GROUND_Y; this.vy = 0; this.onGround = true; this.jumpCount = 0; }
        if (this.onGround && gameState === 'playing') this.runFrame += 0.3;
    },
    draw() {
        // 无敌帧闪烁
        if (this.invul > Date.now() && Math.floor(frameCount/3)%2===0) return;
        const C = getSkinColors(gameData.currentSkin);
        const cx = this.x + this.width/2;
        const legSwing = this.onGround ? Math.sin(this.runFrame) * 9 : 0;
        const armSwing = this.onGround ? Math.sin(this.runFrame) * 7 : 5;
        const eyeY = this.onGround ? this.y+11 : this.y+9;

        if (hasBuff('shield')) {
            ctx.save(); ctx.globalAlpha = 0.35+Math.sin(frameCount*0.2)*0.2;
            ctx.strokeStyle = '#74b9ff'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(cx, this.y+33, 46, 0, Math.PI*2); ctx.stroke();
            ctx.restore();
        }
        ctx.fillStyle = C.pants;
        ctx.fillRect(this.x+9, this.y+44, 9, 22+legSwing);
        ctx.fillRect(this.x+26, this.y+44, 9, 22-legSwing);
        const g = ctx.createLinearGradient(this.x, this.y+16, this.x, this.y+48);
        g.addColorStop(0, C.body[0]); g.addColorStop(1, C.body[1]);
        ctx.fillStyle = g; ctx.fillRect(this.x+7, this.y+20, 30, 30);
        ctx.fillStyle = C.skin;
        ctx.fillRect(this.x+1, this.y+24+armSwing, 8, 20);
        ctx.fillRect(this.x+35, this.y+24-armSwing, 8, 20);
        ctx.fillStyle = C.skin;
        ctx.beginPath(); ctx.arc(cx, this.y+13, 15, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = C.hair;
        ctx.beginPath(); ctx.arc(cx, this.y+7, 14, Math.PI, 2*Math.PI); ctx.fill();
        ctx.fillRect(cx-14, this.y+3, 28, 7);
        if (gameData.currentSkin === 'rainbow') { const hue = (frameCount*5)%360; ctx.fillStyle=`hsl(${hue},100%,70%)`; ctx.fillRect(cx-14, this.y+3, 28, 7); }
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(cx-5, eyeY, 3.5, 0, Math.PI*2); ctx.arc(cx+5, eyeY, 3.5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(cx-4, eyeY, 1.8, 0, Math.PI*2); ctx.arc(cx+6, eyeY, 1.8, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#222'; ctx.lineWidth = 1.8; ctx.beginPath();
        if (this.onGround) ctx.arc(cx, this.y+18, 3.5, 0, Math.PI);
        else ctx.arc(cx, this.y+19, 3.5, 0, Math.PI*2);
        ctx.stroke();
    },
    getHitbox() { return { x:this.x+9, y:this.y+6, width:this.width-18, height:this.height-6 }; }
};

// 障碍物（保留老障碍物系统，和敌人并存）
const OBSTACLE_TYPES = [
    { type:'box', width:38, height:38, color:'#8B4513' },
    { type:'tallBox', width:42, height:60, color:'#654321' },
    { type:'wideBox', width:70, height:32, color:'#A0522D' },
    { type:'spike', width:48, height:32, color:'#444' }
];
function spawnObstacle() {
    const i = Math.floor(Math.random()*OBSTACLE_TYPES.length);
    const t = OBSTACLE_TYPES[i];
    const y = GROUND_Y - t.height + 70;
    obstacles.push({ x:canvas.width+30, y, width:t.width, height:t.height, color:t.color, type:t.type, dead:false, score:10, reward:0 });
}
function drawObstacles() {
    obstacles.forEach(o => {
        if (o.dead) return;
        if (o.type === 'spike') {
            ctx.fillStyle = o.color;
            const sw = o.width/3;
            for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(o.x+i*sw, o.y+o.height); ctx.lineTo(o.x+i*sw+sw/2, o.y); ctx.lineTo(o.x+(i+1)*sw, o.y+o.height); ctx.closePath(); ctx.fill(); }
            ctx.strokeStyle='#ff4444'; ctx.lineWidth=2; ctx.stroke();
        } else {
            const g2 = ctx.createLinearGradient(o.x, o.y, o.x, o.y+o.height);
            g2.addColorStop(0, o.color); g2.addColorStop(1, shadeColor(o.color, -20));
            ctx.fillStyle = g2; ctx.fillRect(o.x, o.y, o.width, o.height);
            ctx.strokeStyle = shadeColor(o.color, -40); ctx.lineWidth=3; ctx.strokeRect(o.x, o.y, o.width, o.height);
        }
    });
}

// 金币
function spawnCoin() {
    const heights = [GROUND_Y-50, GROUND_Y-120, GROUND_Y-190, GROUND_Y-260];
    const y = heights[Math.floor(Math.random()*heights.length)];
    const n = Math.random()<0.3 ? 3+Math.floor(Math.random()*3) : 1;
    for (let i = 0; i < n; i++) coinList.push({ x:canvas.width+60+i*36, y, vy:0, radius:14, collected:false, angle:i*0.3 });
}
function drawCoins() {
    coinList.forEach(c => {
        if (c.collected) return;
        if (c.isRain) { c.y += c.vy; if (c.y > GROUND_Y - 40) c.y = GROUND_Y - 40; }
        if (hasBuff('magnet') || hasBuff('heal')) {
            const dx = (player.x+player.width/2) - c.x; const dy = (player.y+player.height/2) - c.y;
            const d = Math.hypot(dx, dy); if (d < 240) { c.x += dx/d*6; c.y += dy/d*6; }
        }
        ctx.save();
        c.angle += 0.1; const bob = Math.sin(c.angle)*3; const sx = Math.abs(Math.cos(c.angle*1.5));
        ctx.translate(c.x, c.y+bob); ctx.scale(sx, 1);
        const rg = ctx.createRadialGradient(0,0,2,0,0,c.radius);
        rg.addColorStop(0,'#fff6a8'); rg.addColorStop(0.6,'#f7c948'); rg.addColorStop(1,'#d4a536');
        ctx.beginPath(); ctx.arc(0,0,c.radius,0,Math.PI*2); ctx.fillStyle = rg; ctx.fill();
        ctx.strokeStyle = '#b89428'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#b89428'; ctx.font='bold 14px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('¥',0,0);
        ctx.restore();
    });
}

// 粒子
function createJumpParticles(x,y,extra) { const n = extra?16:11; for (let i = 0; i < n; i++) particles.push({ x,y, vx:(Math.random()-0.5)*6, vy:Math.random()*-4, radius:2+Math.random()*3, color:extra?`hsl(${Math.random()*360},100%,70%)`:`hsl(${40+Math.random()*20},100%,${60+Math.random()*20}%)`, life:1 }); }
function createCoinParticles(x,y) { for (let i = 0; i < 8; i++) { const a = Math.PI*2*i/8; particles.push({ x,y,vx:Math.cos(a)*4,vy:Math.sin(a)*4,radius:3,color:'#f7c948',life:1 }); } }
function updateParticles() { particles = particles.filter(p => { p.x+=p.vx; p.y+=p.vy; p.vy+=0.2; p.life-=0.028; return p.life>0; }); }
function drawParticles() { particles.forEach(p => { ctx.save(); ctx.globalAlpha=p.life; ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.radius*p.life,0,Math.PI*2); ctx.fill(); ctx.restore(); }); }

function shadeColor(color, percent) { const num = parseInt(color.replace('#',''),16); const amt = Math.round(2.55*percent); const R = Math.max(0, Math.min(255, (num>>16)+amt)); const G = Math.max(0, Math.min(255, ((num>>8)&0xff)+amt)); const B = Math.max(0, Math.min(255, (num&0xff)+amt)); return '#'+(0x1000000+R*0x10000+G*0x100+B).toString(16).slice(1); }

function initBackground() {
    clouds=[]; buildings=[]; groundTiles=[];
    for (let i = 0; i < 6; i++) clouds.push({ x:Math.random()*canvas.width, y:40+Math.random()*160, size:30+Math.random()*40, speed:0.3+Math.random()*0.3 });
    for (let i = 0; i < 9; i++) buildings.push({ x:i*140+Math.random()*30, width:85+Math.random()*55, height:120+Math.random()*140, color:`hsl(${220+Math.random()*30},30%,${30+Math.random()*15}%)` });
    for (let i = 0; i < Math.ceil(canvas.width/50)+2; i++) groundTiles.push({ x:i*50 });
}

function drawBackground() {
    const sg = ctx.createLinearGradient(0,0,0,canvas.height);
    sg.addColorStop(0,'#74b9ff'); sg.addColorStop(0.5,'#a29bfe'); sg.addColorStop(1,'#dfe6e9');
    ctx.fillStyle = sg; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#ffeaa7'; ctx.beginPath(); ctx.arc(canvas.width-130,90,50,0,Math.PI*2); ctx.fill();
    clouds.forEach(c => {
        ctx.save(); ctx.fillStyle='rgba(255,255,255,0.9)';
        const s = c.size;
        ctx.beginPath(); ctx.arc(c.x,c.y,s*0.5,0,Math.PI*2); ctx.arc(c.x+s*0.4,c.y-s*0.2,s*0.4,0,Math.PI*2); ctx.arc(c.x+s*0.8,c.y,s*0.45,0,Math.PI*2); ctx.arc(c.x+s*0.4,c.y+s*0.15,s*0.35,0,Math.PI*2); ctx.fill(); ctx.restore();
        if (gameState==='playing') c.x -= c.speed;
        if (c.x < -120) { c.x = canvas.width+60; c.y = 40+Math.random()*160; }
    });
    buildings.forEach(b => {
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, GROUND_Y+70-b.height, b.width, b.height);
        ctx.fillStyle = 'rgba(255,255,180,0.4)';
        const rows = Math.floor(b.height/28), cols = Math.floor(b.width/22);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) ctx.fillRect(b.x+10+c*22, GROUND_Y+70-b.height+18+r*28, 9, 14);
        if (gameState==='playing') b.x -= gameSpeed*0.2;
        if (b.x < -b.width) { b.x = canvas.width+30; b.width = 85+Math.random()*55; b.height = 120+Math.random()*140; }
    });
}
function drawGround() {
    ctx.fillStyle = '#55efc4'; ctx.fillRect(0, GROUND_Y+35, canvas.width, 35);
    ctx.fillStyle = '#6c5ce7'; ctx.fillRect(0, GROUND_Y+58, canvas.width, canvas.height);
    ctx.fillStyle = '#5f4fcf';
    for (let i = 0; i < 35; i++) { const x = ((i*37-frameCount*gameSpeed)%(canvas.width+40))-20; ctx.fillRect(x, GROUND_Y+75, 7, 5); ctx.fillRect(x+17, GROUND_Y+92, 5, 4); }
    ctx.strokeStyle = '#00b894'; ctx.lineWidth=2;
    for (let i = 0; i < 45; i++) { const x = ((i*27-frameCount*gameSpeed)%(canvas.width+40))-20; ctx.beginPath(); ctx.moveTo(x, GROUND_Y+35); ctx.lineTo(x+3, GROUND_Y+23); ctx.moveTo(x+6, GROUND_Y+35); ctx.lineTo(x+8, GROUND_Y+26); ctx.stroke(); }
    groundTiles.forEach(t => {
        ctx.strokeStyle='rgba(255,255,255,0.1)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(t.x, GROUND_Y+58); ctx.lineTo(t.x, canvas.height); ctx.stroke();
        if (gameState==='playing') t.x -= gameSpeed;
        if (t.x < -50) t.x = Math.max(...groundTiles.map(x=>x.x))+50;
    });
}

function checkCollision(a,b) { return a.x<b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y; }

function checkCollisions() {
    const pb = player.getHitbox();
    const dash = hasBuff('dash');
    // 敌人
    for (const e of enemies) {
        if (e.dead) continue;
        const eb = { x:e.x+6, y:e.y+6, width:e.width-12, height:e.height-12 };
        if (checkCollision(pb, eb)) {
            if (e.frozen > Date.now()) continue; // 冻结了可以穿过
            if (dash) { killEnemyOrObstacle(e); continue; }
            e.hp--; e.hit = Date.now() + 200;
            if (e.hp <= 0) {
                if (e.isBoss) { gameData.bossKilled = (gameData.bossKilled||0) + 1; checkAchievements(); }
                killEnemyOrObstacle(e);
            } else {
                // 没打死，玩家掉血（如果不是无敌）
                if (player.invul < Date.now()) damagePlayer();
            }
            return;
        }
        if (!e.passed && e.x+e.width < player.x) { e.passed = true; score += Math.floor((e.score||50)/2); }
    }
    // 障碍物
    for (const o of obstacles) {
        if (o.dead) continue;
        const ob = { x:o.x+5, y:o.y+5, width:o.width-10, height:o.height-10 };
        if (checkCollision(pb, ob)) {
            if (hasBuff('freeze')) continue;
            if (dash) { killEnemyOrObstacle(o); continue; }
            if (player.invul < Date.now()) { damagePlayer(); o.x = -99999; }
            return;
        }
        if (!o.passed && o.x+o.width < player.x) { o.passed = true; score += 30; combo++; }
    }
    // 金币
    coinList.forEach(c => {
        if (c.collected) return;
        const dx = (player.x+player.width/2)-c.x; const dy = (player.y+player.height/2)-c.y;
        if (Math.hypot(dx,dy) < c.radius+28) {
            c.collected = true; let mul = 1; if (hasBuff('double')) mul *= 2;
            runCoins += mul; score += 20*mul;
            AudioSys.play('coin');
            if (gameData.settings.particlesOn) createCoinParticles(c.x, c.y);
        }
    });
    // 宠物鸟吃金币+啄敌人
    if (petActive) {
        pet.angle += 0.12;
        pet.x = player.x + 50 + Math.cos(pet.angle)*50;
        pet.y = player.y - 20 + Math.sin(pet.angle*1.3)*40;
        // 啄敌人
        enemies.forEach(e => {
            if (e.dead) return;
            const d = Math.hypot(pet.x - (e.x+e.width/2), pet.y - (e.y+e.height/2));
            if (d < 60 && frameCount % 30 === 0) {
                e.hp--; e.hit = Date.now()+200;
                if (e.hp <= 0) killEnemyOrObstacle(e);
            }
        });
        // 吃金币
        coinList.forEach(c => {
            if (c.collected) return;
            if (Math.hypot(pet.x-c.x, pet.y-c.y) < 35) {
                c.collected = true; let mul = 1; if (hasBuff('double')) mul*=2; runCoins += mul; score += 20*mul;
                if (gameData.settings.particlesOn) createCoinParticles(c.x, c.y);
            }
        });
    }
}

function drawPet() {
    if (!petActive) return;
    ctx.font = '34px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🐦', pet.x, pet.y + Math.sin(frameCount*0.3)*3);
}

function hitGameOver() {
    if (hasBuff('revive')) {
        delete activeBuffs.revive; renderActiveBuffs();
        player.y = GROUND_Y - 60; player.vy = -9; playerHp = 1; updateHpUI(); player.invul = Date.now()+1500;
        enemies = enemies.filter(e => e.x+e.width > player.x-80); obstacles = obstacles.filter(o => o.x+o.width > player.x-50);
        AudioSys.play('revive'); showToast('💖 复活成功！', 'success'); return;
    }
    // 💎 凤凰神尊/创世神：额外复活卡被动（本局1次）
    const eff = getSkinEffect(gameData.currentSkin);
    if (eff.extraRevive && !gameData._skinReviveUsed) {
        gameData._skinReviveUsed = true;
        player.y = GROUND_Y - 60; player.vy = -11; playerHp = 2; updateHpUI(); player.invul = Date.now()+2000;
        enemies = enemies.filter(e => e.x+e.width > player.x-80); obstacles = obstacles.filter(o => o.x+o.width > player.x-50);
        // 火焰特效
        for (let i = 0; i < 40; i++) spawnParticle(player.x, player.y+20, '#ff6b35', 4);
        AudioSys.play && AudioSys.play('revive');
        showToast('🔥 浴火重生！凤凰被动·复活！', 'success');
        return;
    }
    gameData._skinReviveUsed = false; // 重置（游戏结束后下次开局重置）
    if (gameData.settings.shakeOn) { document.querySelector('.canvas-wrapper')?.classList.add('shake'); setTimeout(()=>document.querySelector('.canvas-wrapper')?.classList.remove('shake'), 400); }
    AudioSys.play('hit'); setTimeout(()=>AudioSys.play('gameover'), 200);
    gameState = 'over'; combo = 0;
    const diff = DIFFS[sessionDiff];
    const skinEff = getSkinEffect(gameData.currentSkin);
    // 💎 皮肤结算加成：coinMul & scoreMul
    const coinMul = diff.coinMul * (skinEff.coinMul || 1);
    const finalScore = Math.floor(score * (skinEff.scoreMul || 1));
    const earnCoins = Math.floor(runCoins * coinMul);
    gameData.totalGames = (gameData.totalGames||0)+1;
    gameData.totalCoinsEarned = (gameData.totalCoinsEarned||0)+earnCoins;
    gameData.coins += earnCoins;
    if (finalScore > (gameData.highScore||0)) gameData.highScore = finalScore;
    gameData.diffsPlayed = gameData.diffsPlayed||{}; gameData.diffsPlayed[sessionDiff] = true;
    saveData(); checkAchievements();
    const isNew = gameData.highScore === finalScore;
    document.getElementById('finalScore').textContent = finalScore;
    document.getElementById('finalCoins').textContent = runCoins;
    document.getElementById('finalHighScore').textContent = gameData.highScore;
    document.getElementById('newRecord').classList.toggle('hidden', !isNew);
    const bonusTxt = (skinEff.scoreMul && skinEff.scoreMul>1) ? ` + 皮肤x${skinEff.scoreMul}` : '';
    document.getElementById('gainCoins').textContent = `本局获得 +🪙 ${earnCoins} (x${coinMul.toFixed(2)}${bonusTxt})`;
    document.getElementById('gameOverScreen').classList.remove('hidden');
    document.getElementById('score').textContent = finalScore;
    document.getElementById('coins').textContent = runCoins;
    AudioSys.stopBGM();
    // 联机结束
    if (isHost) sendOnline({ type:'gameover', score, coins:earnCoins });
}

// ========== 【游戏主循环】 ==========
let animId = null;
function gameLoop() {
    if (gameState === 'playing') {
        frameCount++;
        ctx.clearRect(0,0,canvas.width,canvas.height);
        drawBackground(); drawGround();

        const diff = DIFFS[sessionDiff];
        const freeze = hasBuff('freeze');
        const slow = hasBuff('slow');
        const dash = hasBuff('dash');
        if (gameSpeed < MAX_SPEED*diff.speedMul*(dash?1.4:1)) gameSpeed += SPEED_INCREMENT*(dash?1.5:1);

        const actualSpeed = freeze ? gameSpeed*0.15 : (slow ? gameSpeed*0.3 : gameSpeed);
        coinList.forEach(c => { if (!c.isRain) c.x -= actualSpeed; });
        coinList = coinList.filter(c => c.x > -60 && !c.collected);
        drawCoins();

        obstacles.forEach(o => { o.x -= actualSpeed; });
        obstacles = obstacles.filter(o => o.x > -120 && !o.dead);
        drawObstacles();

        enemies.forEach(e => {
            if (e.frozen <= Date.now()) {
                e.x -= actualSpeed;
                if (e.moves) e.y = e.baseY + Math.sin((e.x+e.moveSeed)*0.03)*20;
            }
        });
        enemies = enemies.filter(e => e.x > -150 && !e.dead);
        drawEnemies();

        const gapEnemy = Math.max(70, (200/diff.obsMul) - Math.floor(score/120)*6);
        const gapObstacle = Math.max(100, (220/diff.obsMul) - Math.floor(score/150)*5);
        if (frameCount % Math.ceil(gapEnemy) === 0 && Math.random() < 0.75) spawnEnemy();
        if (frameCount % Math.ceil(gapObstacle+30) === 0 && Math.random() < 0.5) spawnObstacle();
        if (frameCount % 110 === 0 && Math.random() < 0.7) spawnCoin();

        player.update(); player.draw();
        drawPet();
        if (gameData.settings.particlesOn) { updateParticles(); drawParticles(); }

        checkCollisions();
        renderActiveBuffs();
        updateSkillCDs();

        if (frameCount % 9 === 0) score++;

        document.getElementById('score').textContent = score;
        document.getElementById('coins').textContent = runCoins;
        const lv = Math.min(10, 1 + Math.floor((gameSpeed-BASE_SPEED)*2));
        document.getElementById('speedLevel').textContent = lv;

        // 联机主机：实时同步画面给副手
        syncStateToHelper();
    } else if (canvasMode === 'watching') {
        // 联机副手：优先渲染主机同步过来的实时画面
        frameCount++;
        ctx.clearRect(0,0,canvas.width,canvas.height);
        // 背景始终画
        if (onlineState.bgClouds) {
            // 用主机同步的背景参数（简化：直接画本地背景也可以，保证一致性）
            drawBackground(); drawGround();
        } else {
            drawBackground(); drawGround();
        }
        // 如果有同步数据，画真实的游戏元素
        if (onlineState && onlineState.player) {
            const sp = onlineState.player;
            // 画临时玩家（模拟主机位置）
            player.x = sp.x; player.y = sp.y; player.vy = sp.vy||0; player.onGround = sp.onGround; player.runFrame = sp.runFrame||0;
            player.draw();
            // 画敌人
            if (onlineState.enemies) {
                const savedEnemies = enemies;
                enemies = onlineState.enemies.map(e => ({...e, frozen: e.frozen||0, hit: e.hit||0}));
                drawEnemies();
                enemies = savedEnemies;
            }
            // 画障碍物
            if (onlineState.obstacles) {
                const savedObs = obstacles;
                obstacles = onlineState.obstacles.map(o => ({...o}));
                drawObstacles();
                obstacles = savedObs;
            }
            // 画金币
            if (onlineState.coins) {
                const savedCoins = coinList;
                coinList = onlineState.coins.map(c => ({...c}));
                drawCoins();
                coinList = savedCoins;
            }
            // 画宠物
            if (onlineState.petActive) {
                petActive = true; pet = onlineState.pet||pet; drawPet(); petActive = false;
            }
            // 画粒子
            if (onlineState.particles && gameData.settings.particlesOn) {
                const savedP = particles;
                particles = onlineState.particles.map(p=>({...p}));
                drawParticles();
                particles = savedP;
            }
        } else {
            player.draw();
            // 等待画面提示
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(canvas.width/2-230, canvas.height/2-60, 460, 120);
            ctx.strokeStyle = '#55efc4'; ctx.lineWidth = 3;
            ctx.strokeRect(canvas.width/2-230, canvas.height/2-60, 460, 120);
            ctx.fillStyle = 'white'; ctx.font = 'bold 26px Microsoft YaHei'; ctx.textAlign='center';
            ctx.fillText('🎮 你是联机伙伴（副手）', canvas.width/2, canvas.height/2-10);
            ctx.font = '18px Microsoft YaHei';
            ctx.fillStyle = '#ffeaa7';
            ctx.fillText('按 Q W E R T A S D F G 帮主机放技能！', canvas.width/2, canvas.height/2+25);
            ctx.fillStyle = '#55efc4'; ctx.font = '14px Microsoft YaHei';
            ctx.fillText('等待主机开始游戏...', canvas.width/2, canvas.height/2+50);
        }
        updateSkillCDs();
    }
    animId = requestAnimationFrame(gameLoop);
}

// 主机端：节流同步游戏状态，每 ~100ms 发送一次
let _lastSync = 0;
function syncStateToHelper() {
    if (!isHost || !myConn || !myConn.open) return;
    const now = Date.now();
    if (now - _lastSync < 90) return; // 节流：10fps 足够
    _lastSync = now;
    const state = {
        gameState,
        score, coins: runCoins,
        speedLv: Math.min(10, 1 + Math.floor((gameSpeed-BASE_SPEED)*2)),
        hp: playerHp,
        activeBuffs,
        gameOver: gameState === 'over',
        bgClouds: true,
        player: { x: player.x, y: player.y, vy: player.vy, onGround: player.onGround, runFrame: player.runFrame },
        enemies: enemies.filter(e => !e.dead && e.x < canvas.width + 100).map(e => ({
            type:e.type, name:e.name, x:e.x, y:e.y, width:e.width, height:e.height, hp:e.hp, maxHp:e.maxHp,
            color:e.color, emoji:e.emoji, isAir:!!e.isAir, isBoss:!!e.isBoss, frozen:e.frozen||0, hit:e.hit||0
        })),
        obstacles: obstacles.filter(o => !o.dead && o.x < canvas.width + 100).map(o => ({
            x:o.x, y:o.y, width:o.width, height:o.height, color:o.color, type:o.type
        })),
        coins: coinList.filter(c => !c.collected).map(c => ({ x:c.x, y:c.y, radius:c.radius, angle:c.angle, isRain:!!c.isRain })),
        particles: particles.slice(0, 60).map(p => ({ x:p.x, y:p.y, radius:p.radius, color:p.color, life:p.life })),
        petActive, pet
    };
    sendOnline({ type: 'state', state });
}

function idleLoop() {
    if (gameState !== 'playing' && canvasMode !== 'watching') {
        frameCount++;
        ctx.clearRect(0,0,canvas.width,canvas.height);
        drawBackground(); drawGround(); player.draw();
    }
    requestAnimationFrame(idleLoop);
}

// ========== 【游戏控制函数】 ==========
function startGame() {
    AudioSys.init(); AudioSys.startBGM();
    sessionDiff = gameData.currentDiff || selectedDiff || 'normal';
    gameState = 'playing'; canvasMode = 'normal';
    score = 0; runCoins = 0; gameSpeed = BASE_SPEED * DIFFS[sessionDiff].speedMul;
    frameCount = 0;
    // ====== 💎 皮肤被动效果（神话/至尊皮肤专属） ======
    const eff = getSkinEffect(gameData.currentSkin);
    const baseHp = MAX_HP + (eff.extraHp||0); // 创世神 +2心
    const hpMax = Math.min(baseHp, 5);
    playerHp = hpMax;
    updateHpUI(hpMax);
    // 初始金币加成
    if (eff.startCoins) runCoins += eff.startCoins;
    // 初始道具加成（神龙/创世神）
    if (eff.startShields) for (let i=0;i<eff.startShields;i++) { addBuff('shield', 99999); addShieldParticle(); }
    if (eff.startMagnet) addBuff('magnet', 15); // 前15秒磁铁
    enemies = []; obstacles = []; coinList = []; particles = [];
    activeBuffs = {}; skillCooldowns = {}; tripleJumpActive = false; petActive = false;
    // 创世神皮肤：开局回满至 hpMax 心（已经在上面赋值了playerHp）
    lastBossScore = 0;
    document.getElementById('doubleCoinChip').style.display = 'none';
    document.getElementById('hpChip').style.display = 'flex';
    document.getElementById('partnerStatus').classList.toggle('hidden', !isHost);
    if (isHost) { document.getElementById('modeLabel').textContent = '🌐 联机模式 · 你是主机（跑酷）'; document.getElementById('partnerStatus').classList.remove('hidden'); document.getElementById('partnerName').textContent = '联机伙伴'; }
    else document.getElementById('modeLabel').textContent = '🎮 单人模式';
    player.reset(); initBackground(); refreshItemCounts(); renderActiveBuffs(); renderSkillBar();
    document.getElementById('score').textContent = '0'; document.getElementById('coins').textContent = runCoins;
    document.getElementById('speedLevel').textContent = '1';
    document.getElementById('pauseScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    // 提示皮肤特效
    const skin = getSkin(gameData.currentSkin);
    if (eff && Object.keys(eff).length) showToast(`✨ 皮肤【${skin.name}】被动生效！祝你好运~`, 'success');
}
function togglePause() {
    if (gameState === 'playing') { gameState = 'paused'; document.getElementById('pauseScreen').classList.remove('hidden'); }
    else if (gameState === 'paused') { gameState = 'playing'; document.getElementById('pauseScreen').classList.add('hidden'); }
}
function quitToMenu() {
    gameState = 'idle'; canvasMode = 'normal';
    enemies=[]; obstacles=[]; coinList=[]; particles=[]; activeBuffs={};
    document.getElementById('pauseScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('doubleCoinChip').style.display = 'none';
    AudioSys.stopBGM();
    showScreen('menu');
}

document.getElementById('btnPause').onclick = togglePause;
document.getElementById('btnResume').onclick = togglePause;
document.getElementById('btnRestart').onclick = () => { document.getElementById('pauseScreen').classList.add('hidden'); startGame(); };
document.getElementById('btnQuit').onclick = quitToMenu;
document.getElementById('btnBackMenu').onclick = quitToMenu;
document.getElementById('btnBackMenu2').onclick = quitToMenu;
document.getElementById('btnRetry').onclick = () => { document.getElementById('gameOverScreen').classList.add('hidden'); startGame(); };

// ========== 【键盘 & 鼠标（新增技能键）】 ==========
document.addEventListener('keydown', e => {
    // 技能键
    if (SKILL_MAP[e.key.toLowerCase()]) {
        e.preventDefault();
        if (gameState === 'playing' || isOnlineHelper) useSkill(e.key.toLowerCase());
        return;
    }
    if (e.key.toLowerCase() === 'k') { renderSkillLib(); showScreen('skillLib'); return; }
    if (gameState === 'playing' || gameState === 'paused' || isOnlineHelper) {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            e.preventDefault();
            if (gameState === 'playing' && !isOnlineHelper) player.jump();
        }
        if (e.code === 'KeyP') { e.preventDefault(); togglePause(); }
        if (e.code === 'Digit1') useItem('shield');
        if (e.code === 'Digit2') useItem('magnet');
        if (e.code === 'Digit3') useItem('revive');
        if (e.code === 'Digit4') useItem('double');
    }
});
canvas.addEventListener('click', () => { if (gameState === 'playing' && !isOnlineHelper) player.jump(); });
canvas.addEventListener('touchstart', e => { e.preventDefault(); if (gameState === 'playing' && !isOnlineHelper) player.jump(); }, { passive:false });

// ========== 【启动初始化】 ==========
initBackground();
player.draw();
idleLoop();
if (!animId) animId = requestAnimationFrame(gameLoop);
refreshMenuUI();
renderSkillBar();
console.log('%c🏃 跑酷大冒险 v2.0 加载成功！','color:#f7c948;font-size:18px;font-weight:bold');
console.log('%c11种技能 · 5种敌人 · 真双人P2P联机','color:#55efc4;font-size:14px');
