/* =========================================================
   ひだまり舎 デモサイト スクリプト
   1. スマホ用メニューの開閉
   2. 「ただいま営業中」表示（大阪の時刻で判定）
   3. 未接続の機能（予約・Instagram）を押したときの案内
   ========================================================= */

(function () {
  "use strict";

  // ---------- 1. スマホ用メニュー ----------
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("global-nav");

  function setMenu(open) {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.querySelector(".visually-hidden").textContent = open ? "メニューを閉じる" : "メニューを開く";
    nav.classList.toggle("is-open", open);
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      setMenu(toggle.getAttribute("aria-expanded") !== "true");
    });
    // メニュー内のリンクを押したら閉じる
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a, button")) setMenu(false);
    });
    // Escキーで閉じる
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        setMenu(false);
        toggle.focus();
      }
    });
  }

  // ---------- 2. 営業中表示 ----------
  // 営業時間を変えたら、ここと index.html の表の両方を直してください。
  // 0=日, 1=月, ... 6=土。null は定休日。時間は「時*60+分」。
  var HOURS = {
    0: [9 * 60, 19 * 60],
    1: null,
    2: [8 * 60, 18 * 60],
    3: [8 * 60, 18 * 60],
    4: [8 * 60, 18 * 60],
    5: [8 * 60, 18 * 60],
    6: [9 * 60, 19 * 60]
  };

  function osakaNow() {
    // 見ている人の端末のタイムゾーンに関係なく、日本時間で判定する
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23"
    }).formatToParts(new Date());
    var get = function (type) {
      for (var i = 0; i < parts.length; i++) if (parts[i].type === type) return parts[i].value;
      return "";
    };
    var days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { day: days[get("weekday")], minutes: Number(get("hour")) * 60 + Number(get("minute")) };
  }

  var status = document.getElementById("open-status");
  if (status) {
    try {
      var now = osakaNow();
      var today = HOURS[now.day];
      var isOpen = !!today && now.minutes >= today[0] && now.minutes < today[1];
      // 祝日は判定していないため「目安」と表記する
      status.textContent = (isOpen ? "ただいま営業時間内です" : "ただいま営業時間外です") + "（デモ・目安表示）";
      status.classList.toggle("is-open", isOpen);
    } catch (err) {
      // 古いブラウザなどで判定できなければ何も表示しない
    }
  }

  // ---------- 3. 未接続機能の案内 ----------
  var MESSAGES = {
    reserve: "このデモサイトでは予約機能を接続していません。ボタンを押しても予約は行われません。実際の導入時には、電話・予約フォーム・外部予約サービスなどお店に合わせた方法で設定します。",
    instagram: "このデモサイトではInstagramアカウントを接続していません。実際の導入時には、お店の公式アカウントへのリンクを設定します。"
  };

  var dialog = document.getElementById("unavailable-dialog");
  var message = document.getElementById("dialog-message");

  document.querySelectorAll(".js-unavailable").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = MESSAGES[btn.getAttribute("data-feature")] || "この機能はデモのため未接続です。";
      if (dialog && typeof dialog.showModal === "function") {
        message.textContent = text;
        dialog.showModal();
      } else {
        window.alert(text);
      }
    });
  });

  // ---------- フッターの年 ----------
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
