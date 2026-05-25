    const FIREBASE_CONFIG = {
      apiKey: "AIzaSyCfyk7GlqjdMaOpDy9TTr_3yLEt3L5wOnY",
      authDomain: "copa-2026-f8c83.firebaseapp.com",
      databaseURL: "https://copa-2026-f8c83-default-rtdb.firebaseio.com",
      projectId: "copa-2026-f8c83",
      storageBucket: "copa-2026-f8c83.firebasestorage.app",
      messagingSenderId: "1096577916136",
      appId: "1:1096577916136:web:fb4d148b6fe3be3392bd5d"
    };

    const MATCHES = [
      {
        id: "match_13_06",
        shortLabel: "13/06",
        opponent: "Marrocos",
        stage: "Abertura",
        dateLabel: "Sab · 13/06 · 19:00",
        location: "Leo & BK Arena",
        copy: "Estreia oficial da bagunca. Churrasco, zoeira e o primeiro teste do bolao."
      },
      {
        id: "match_19_06",
        shortLabel: "19/06",
        opponent: "Haiti",
        stage: "Grupo em alta",
        dateLabel: "Qui · 19/06 · 22:00",
        location: "Varanda nervosa",
        copy: "Jogo de noite, nervo em dia e chance perfeita de virar o ranking de ponta-cabeca."
      },
      {
        id: "match_24_06",
        shortLabel: "24/06",
        opponent: "Escócia",
        stage: "Fecha grupos",
        dateLabel: "Ter · 24/06 · 19:00",
        location: "Modo classificacao",
        copy: "Rodada para separar quem estuda tabela de quem palpita na intuicao total."
      },
      {
        id: "round_16",
        shortLabel: "Oitavas",
        opponent: "A definir",
        stage: "Mata-mata",
        dateLabel: "30/06 · horario TBD",
        location: "Pressao maxima",
        copy: "Se chegou ate aqui, cada chute vale ouro e cada ausencia vira assunto no grupo."
      }
    ];

    const DEFAULT_GUESTS = {
      leo:       { name: "Leo",        first: "L",  color: "#00BCD4" },
      bk:        { name: "BK",         first: "B",  color: "#FFCC00" },
      daniel:    { name: "Daniel",     first: "D",  color: "#009c3B" },
      enailreg:  { name: "Enailreg",   first: "E",  color: "#002776" },
      felipe:    { name: "Felipe",     first: "F",  color: "#FF0000" },
      gabru:     { name: "Gabru",      first: "G",  color: "#C9A84C" },
      glorinha:  { name: "Gl",         first: "Gl", color: "#E91E63" },
      gustavo:   { name: "Gustavo P.", first: "GP", color: "#3F51B5" },
      ilana:     { name: "Ilana",      first: "I",  color: "#9C27B0" },
      natan:     { name: "Natan",      first: "N",  color: "#FF9800" },
      rosangela: { name: "Rosangela",  first: "R",  color: "#795548" }
    };

    const GUEST_COLORS = [
      "#00BCD4", "#FFCC00", "#009c3B", "#002776", "#FF0000",
      "#C9A84C", "#E91E63", "#3F51B5", "#9C27B0", "#FF9800",
      "#795548", "#29B6F6", "#FF7043", "#673AB7", "#009688"
    ];

    const SAD_RESPONSES = [
      "Esperava mais de voce. O hexa nao se constroi sozinho.",
      "Poxa, pelo menos avisou antes da carne entrar na grelha.",
      "Vai fazer falta. Quem vai rir das piadas ruins agora?",
      "Essa ausencia tirou 12% do carisma da rodada.",
      "Tudo bem, mas seu lugar vai ser lembrado com drama.",
      "Quem falta perde moral no grupo e talvez uns pontinhos imaginarios."
    ];

    const ADD_GUEST_PASSWORD = "261426";

    const $ = id => document.getElementById(id);
    const escapeHtml = value => String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

    let db;
    let guests = { ...DEFAULT_GUESTS };
    let confirmedYes = [];
    let confirmedNo = {};
    let currentMatchId = MATCHES[0].id;
    let currentAction = null;
    let wrongPassTimer = null;
    let pendingNoId = null;
    let pendingDeleteId = null;
    let pendingPredictionGuestId = null;
    let pendingPredictionWinner = "brazil";

    // New UX State variables
    let currentUserId = localStorage.getItem("currentGuestId") || null;
    let pendingActionGuestId = null;
    let currentTab = "rsvp";

    const matchState = MATCHES.reduce((acc, match) => {
      acc[match.id] = {
        yes: [],
        no: {},
        predictions: {},
        result: null
      };
      return acc;
    }, {});

    function getCurrentMatch() {
      return MATCHES.find(match => match.id === currentMatchId) || MATCHES[0];
    }

    function getCurrentState() {
      return matchState[currentMatchId];
    }

    function syncCurrentMatchRefs() {
      const current = getCurrentState();
      confirmedYes = [...current.yes];
      confirmedNo = { ...current.no };
    }

    function normalizeMatchState(matchId) {
      const state = matchState[matchId];
      state.yes = Array.isArray(state.yes) ? Array.from(new Set(state.yes.filter(id => guests[id]))) : [];
      state.no = Object.fromEntries(Object.entries(state.no || {}).filter(([id]) => guests[id]));
      state.predictions = Object.fromEntries(Object.entries(state.predictions || {}).filter(([id]) => guests[id]));
    }

    function outcomeFromScore(brazil, opponent) {
      if (brazil > opponent) return "brazil";
      if (brazil < opponent) return "opponent";
      return "draw";
    }

    function scorePrediction(prediction, result) {
      if (!prediction || !result) return null;

      const predictedBrazil = Number(prediction.brazil);
      const predictedOpponent = Number(prediction.opponent);
      const resultBrazil = Number(result.brazil);
      const resultOpponent = Number(result.opponent);

      if (
        [predictedBrazil, predictedOpponent, resultBrazil, resultOpponent]
          .some(value => Number.isNaN(value))
      ) {
        return null;
      }

      const predictedOutcome = outcomeFromScore(predictedBrazil, predictedOpponent);
      const finalOutcome = outcomeFromScore(resultBrazil, resultOpponent);
      const exact = predictedBrazil === resultBrazil && predictedOpponent === resultOpponent;

      if (exact) {
        return { points: 5, perfect: true, outcome: predictedOutcome };
      }

      if (predictedOutcome === finalOutcome) {
        return { points: 3, perfect: false, outcome: predictedOutcome };
      }

      return { points: 0, perfect: false, outcome: predictedOutcome };
    }

    function computeLeaderboard() {
      const board = Object.entries(guests).map(([id, guest]) => ({
        id,
        name: guest.name,
        first: guest.first,
        color: guest.color,
        points: 0,
        perfects: 0,
        calls: 0
      }));
      const byId = Object.fromEntries(board.map(item => [item.id, item]));

      MATCHES.forEach(match => {
        const state = matchState[match.id];
        const result = state.result;
        if (!result) return;

        Object.entries(state.predictions).forEach(([guestId, prediction]) => {
          const row = byId[guestId];
          if (!row) return;
          const scored = scorePrediction(prediction, result);
          if (!scored) return;
          row.points += scored.points;
          row.calls += 1;
          if (scored.perfect) row.perfects += 1;
        });
      });

      return board
        .filter(item => item.calls > 0 || item.points > 0)
        .sort((a, b) => (
          b.points - a.points ||
          b.perfects - a.perfects ||
          a.name.localeCompare(b.name)
        ));
    }

    function getPerfectPredictors(matchId) {
      const state = matchState[matchId];
      if (!state.result) return [];
      return Object.entries(state.predictions)
        .map(([guestId, prediction]) => {
          const scored = scorePrediction(prediction, state.result);
          if (!scored || !scored.perfect || !guests[guestId]) return null;
          return guests[guestId].name;
        })
        .filter(Boolean);
    }

    function predictionLabel(prediction) {
      if (!prediction) return "Sem palpite";
      return `Brasil ${prediction.brazil} x ${prediction.opponent} ${getCurrentMatch().opponent}`;
    }

    function updateHero() {
      const match = getCurrentMatch();
      const perfectNames = getPerfectPredictors(match.id);
      const html = `
        <h1>Brasil x ${escapeHtml(match.opponent)}</h1>
        <p class="hero-subtitle">${escapeHtml(match.copy)}</p>
        <div class="hero-meta">
          <div class="chip">${escapeHtml(match.stage)}</div>
          <div class="chip">${escapeHtml(match.dateLabel)}</div>
          <div class="chip">${escapeHtml(match.location)}</div>
          <div class="chip">${perfectNames.length ? `Lendas da rodada: ${escapeHtml(perfectNames.join(", "))}` : "Bolao valendo lenda da rodada"}</div>
        </div>
      `;
      $("hero-content").innerHTML = html;
    }

    function renderMatchTabs() {
      const stateBoard = computeLeaderboard();
      const leader = stateBoard[0];
      $("match-tabs").innerHTML = MATCHES.map(match => {
        const state = matchState[match.id];
        const active = match.id === currentMatchId ? "active" : "";
        const submitted = Object.keys(state.predictions || {}).length;
        const resultState = state.result ? `placar ${state.result.brazil}-${state.result.opponent}` : `${submitted} palpites`;
        return `
          <button class="match-tab ${active}" data-match-id="${match.id}">
            <strong>${escapeHtml(match.shortLabel)} · BRA x ${escapeHtml(match.opponent)}</strong>
            <span>${escapeHtml(match.stage)} · ${escapeHtml(resultState)}</span>
            <span>${leader ? `lider geral: ${escapeHtml(leader.first)} ${leader.points} pts` : "ranking abre no primeiro resultado"}</span>
          </button>
        `;
      }).join("");

      document.querySelectorAll(".match-tab").forEach(button => {
        button.onclick = () => {
          currentMatchId = button.dataset.matchId;
          syncCurrentMatchRefs();
          render();
        };
      });
    }

    function renderStats() {
      const current = getCurrentState();
      const totalGuests = Object.keys(guests).length;
      const totalYes = current.yes.length;
      const totalNo = Object.keys(current.no).length;
      const totalPredictions = Object.keys(current.predictions).length;

      $("stats").innerHTML = `
        <div class="stat-card">
          <span>Confirmados</span>
          <strong>${totalYes}</strong>
        </div>
        <div class="stat-card">
          <span>Desculpas</span>
          <strong>${totalNo}</strong>
        </div>
        <div class="stat-card">
          <span>Palpites</span>
          <strong>${totalPredictions}/${totalGuests}</strong>
        </div>
        <div class="stat-card">
          <span>Resultado</span>
          <strong>${current.result ? `${current.result.brazil}-${current.result.opponent}` : "--"}</strong>
        </div>
      `;
    }

    function renderGuests() {
      const grid = $("grid");
      const current = getCurrentState();
      const perfectNames = new Set(getPerfectPredictors(currentMatchId));

      grid.innerHTML = "";

      Object.entries(guests).forEach(([id, guest]) => {
        const isYes = current.yes.includes(id);
        const noData = current.no[id] || null;
        const prediction = current.predictions[id];
        const perfect = perfectNames.has(guest.name);
        const isSelf = currentUserId === id;

        let className = "guest";
        if (isYes) className += " confirmed-yes";
        if (noData) className += " confirmed-no";
        if (perfect) className += " has-perfect";
        if (isSelf) className += " is-self";

        const statusTag = isYes
          ? '<div class="status-tag yes">👍 Vai colar</div>'
          : noData
            ? '<div class="status-tag no">👎 Foi de desculpa</div>'
            : '<div class="mini-pill">Em cima do muro</div>';

        const note = prediction
          ? `<div class="prediction-score">Palpite ${escapeHtml(prediction.brazil)}-${escapeHtml(prediction.opponent)}</div>`
          : '<div class="guest-note">Sem palpite ainda</div>';

        const reason = noData && noData.reason
          ? `<div class="reason">"${escapeHtml(noData.reason)}"</div>`
          : "";

        const perfectBadge = perfect ? '<div class="mini-pill">🏆 Placar cravado</div>' : "";
        const selfBadge = isSelf ? '<div class="self-badge">Você</div>' : "";

        const card = document.createElement("div");
        card.className = className;
        card.innerHTML = `
          <div class="avatar" style="background:${guest.color}">${escapeHtml(guest.first)}</div>
          <div class="name">${escapeHtml(guest.name)}</div>
          ${selfBadge}
          ${statusTag}
          ${perfectBadge}
          ${note}
          ${reason}
        `;
        card.onclick = () => openGuestActionsModal(id);
        grid.appendChild(card);
      });

      const addCard = document.createElement("div");
      addCard.className = "add-guest-card";
      addCard.innerHTML = `
        <div class="avatar">+</div>
        <div class="name">add guest</div>
        <div class="guest-note">mais um no esquema</div>
      `;
      addCard.onclick = openAddGuestModal;
      grid.appendChild(addCard);

      const delCard = document.createElement("div");
      delCard.className = "add-guest-card";
      delCard.style.cssText = "border-color:rgba(255,0,0,0.3);color:rgba(255,80,80,0.6);";
      delCard.innerHTML = `
        <div class="avatar" style="border-color:rgba(255,0,0,0.28);background:transparent;">🗑️</div>
        <div class="name">remover</div>
        <div class="guest-note">some com o nome da lista</div>
      `;
      delCard.onclick = () => showSelectModal("delete", null);
      grid.appendChild(delCard);
    }

    function renderPredictions() {
      const current = getCurrentState();
      const list = $("prediction-list");
      const rows = Object.entries(current.predictions)
        .filter(([guestId]) => guests[guestId])
        .sort((a, b) => guests[a[0]].name.localeCompare(guests[b[0]].name));

      if (!rows.length) {
        list.innerHTML = '<div class="empty-state">Ninguem cravou ainda. Abre o botao de palpite e deixa o grupo se comprometer.</div>';
        return;
      }

      list.innerHTML = rows.map(([guestId, prediction]) => {
        const guest = guests[guestId];
        const scored = current.result ? scorePrediction(prediction, current.result) : null;
        
        let cardClass = "prediction-card";
        let badgeHtml = "";
        
        if (current.result && scored) {
          if (scored.perfect) {
            cardClass += " hit";
            badgeHtml = '<span class="status-badge hit">🎯 Cravou (+5 pts)</span>';
          } else if (scored.points === 3) {
            cardClass += " outcome";
            badgeHtml = '<span class="status-badge outcome">✅ Acertou Resultado (+3 pts)</span>';
          } else {
            cardClass += " miss";
            badgeHtml = '<span class="status-badge miss">❌ Errou (0 pts)</span>';
          }
        } else {
          cardClass += " pending";
          badgeHtml = '<span class="status-badge pending">🔮 Palpite Feito</span>';
        }

        const meta = `Vencedor previsto: ${prediction.winner === "draw" ? "Empate" : prediction.winner === "brazil" ? "Brasil" : getCurrentMatch().opponent}`;

        return `
          <div class="${cardClass}">
            <div class="avatar" style="background:${guest.color}">${escapeHtml(guest.first)}</div>
            <div>
              <strong>${escapeHtml(guest.name)}</strong>
              <div class="prediction-meta">${escapeHtml(meta)}</div>
              ${badgeHtml}
            </div>
            <div class="prediction-score">${escapeHtml(prediction.brazil)}-${escapeHtml(prediction.opponent)}</div>
          </div>
        `;
      }).join("");
    }

    function renderLeaderboard() {
      const board = computeLeaderboard();
      const container = $("leaderboard");

      if (!board.length) {
        container.innerHTML = '<div class="empty-state">O ranking aparece assim que algum resultado oficial for publicado.</div>';
        return;
      }

      container.innerHTML = board.map((row, index) => `
        <div class="leaderboard-item">
          <div class="rank">#${index + 1}</div>
          <div>
            <strong>${escapeHtml(row.name)}</strong>
            <div class="leaderboard-meta">${row.perfects} placar(es) perfeito(s) · ${row.calls} rodada(s) pontuadas</div>
          </div>
          <div class="points">${row.points}<span>pontos</span></div>
        </div>
      `).join("");
    }

    function renderCelebration() {
      const current = getCurrentState();
      const slot = $("celebration-slot");
      const perfect = getPerfectPredictors(currentMatchId);

      if (!current.result || !perfect.length) {
        slot.innerHTML = "";
        return;
      }

      slot.innerHTML = `
        <div class="celebration">
          <div class="celebration-balls">
            <span>🏆</span>
            <span>🎉</span>
            <span>⚽</span>
            <span>🥇</span>
          </div>
          <h3>Palpite cravado!</h3>
          <p>${escapeHtml(perfect.join(", "))} acertou(aram) o placar exato desta partida. A zoeira agora vem com autoridade estatistica.</p>
        </div>
      `;
    }

    function renderResultBox() {
      const current = getCurrentState();
      const slot = $("result-slot");
      const match = getCurrentMatch();

      if (!current.result) {
        slot.innerHTML = '<div class="empty-state">Resultado ainda nao publicado. Enquanto isso, o caos continua teorico.</div>';
        return;
      }

      slot.innerHTML = `
        <div class="result-box">
          <div class="mini-pill">Resultado oficial</div>
          <div class="result-score">Brasil ${escapeHtml(current.result.brazil)} x ${escapeHtml(current.result.opponent)} ${escapeHtml(match.opponent)}</div>
          <div class="prediction-meta">Atualizado pelos hosts. Ranking e acertos da rodada ja foram recalculados.</div>
        </div>
      `;
    }

    function render() {
      normalizeMatchState(currentMatchId);
      syncCurrentMatchRefs();
      updateHero();
      renderMatchTabs();
      renderStats();
      renderGuests();
      renderPredictions();
      renderCelebration();
      renderResultBox();
      renderLeaderboard();
      $("prediction-opponent-label").textContent = `Gols ${getCurrentMatch().opponent}`;
      $("result-opponent-label").textContent = getCurrentMatch().opponent;

      // Sync active identity visual state
      updateIdentityBox();
    }

    function showSelectModal(action, preselectedId) {
      currentAction = action;

      if (preselectedId) {
        if (action === "yes") handleYes(preselectedId);
        else if (action === "no") handleNo(preselectedId);
        else if (action === "predict") openPredictionModal(preselectedId);
        else handleToggle(preselectedId);
        return;
      }

      const list = $("select-guest-list");
      list.innerHTML = "";

      Object.entries(guests).forEach(([id, guest]) => {
        const button = document.createElement("button");
        button.className = "modal-btn";
        button.style.cssText = `background:${guest.color};color:#fff;min-width:56px;padding:10px 12px;border-radius:12px;`;
        button.textContent = guest.first;
        button.onclick = () => {
          if (action === "yes") handleYes(id);
          else if (action === "no") handleNo(id);
          else if (action === "delete") openDeleteConfirmModal(id);
          else if (action === "predict") openPredictionModal(id);
          else if (action === "identify") identifyUser(id);
          else handleToggle(id);
          closeSelectModal();
        };
        list.appendChild(button);
      });

      if (action === "delete") {
        $("select-modal-title").textContent = "🗑️ Remover convidado";
        $("select-modal-sub").textContent = "Quem vai sair da lista inteira?";
      } else if (action === "predict") {
        $("select-modal-title").textContent = "🔮 Quem vai palpitar?";
        $("select-modal-sub").textContent = "Escolhe a pessoa antes de registrar o placar.";
      } else if (action === "identify") {
        $("select-modal-title").textContent = "👤 Quem é você?";
        $("select-modal-sub").textContent = "Selecione seu perfil para interagir sem senha:";

        // Add clear / logout button
        const clearBtn = document.createElement("button");
        clearBtn.className = "modal-btn cancel";
        clearBtn.style.cssText = "min-width:100%;margin-top:10px;background:#e63b2e;color:#fff;";
        clearBtn.textContent = "Limpar Identificação / Sair";
        clearBtn.onclick = () => {
          identifyUser(null);
          closeSelectModal();
        };
        list.appendChild(clearBtn);
      } else {
        $("select-modal-title").textContent = action === "yes" ? "👍 Vou ir" : "👎 Num vai daaaa";
        $("select-modal-sub").textContent = "Quem e voce?";
      }

      $("modal-select-guest").classList.add("active");
    }

    function closeSelectModal() {
      $("modal-select-guest").classList.remove("active");
    }

    function persistCurrentRsvp() {
      const current = getCurrentState();
      current.yes = [...confirmedYes];
      current.no = { ...confirmedNo };
      saveRsvpToFirebase(currentMatchId);
    }

    function handleYes(id) {
      const newNo = { ...confirmedNo };
      delete newNo[id];
      confirmedNo = newNo;

      if (!confirmedYes.includes(id)) {
        confirmedYes = [...confirmedYes, id];
      }

      persistCurrentRsvp();
      render();
    }

    function handleNo(id) {
      confirmedYes = confirmedYes.filter(x => x !== id);
      persistCurrentRsvp();
      openDeclineModal(id);
    }

    function handleToggle(id) {
      if (confirmedYes.includes(id)) {
        confirmedYes = confirmedYes.filter(x => x !== id);
      } else if (confirmedNo[id]) {
        const newNo = { ...confirmedNo };
        delete newNo[id];
        confirmedNo = newNo;
      } else {
        confirmedYes = [...confirmedYes, id];
      }

      persistCurrentRsvp();
      render();
    }

    function openDeclineModal(id) {
      pendingNoId = id;
      $("decline-reason").value = "";
      $("sad-response").classList.remove("show");
      $("modal-decline").classList.add("active");
      $("decline-reason").focus();
    }

    function closeDeclineModal() {
      $("modal-decline").classList.remove("active");
      pendingNoId = null;
    }

    function openAddGuestModal() {
      $("new-guest-pass").value = "";
      $("new-guest-name").value = "";
      $("new-guest-initials").value = "";

      const requiresPass = !currentUserId;
      $("new-guest-pass").style.display = requiresPass ? "block" : "none";

      $("modal-add-guest").classList.add("active");
      setTimeout(() => {
        if (requiresPass) {
          $("new-guest-pass").focus();
        } else {
          $("new-guest-name").focus();
        }
      }, 80);
    }

    function closeAddGuestModal() {
      $("modal-add-guest").classList.remove("active");
    }

    function openDeleteConfirmModal(id) {
      pendingDeleteId = id;
      $("delete-guest-pass").value = "";
      $("delete-guest-name-text").textContent = `Remover "${guests[id].name}" da lista inteira da Copa?`;

      const isAdmin = currentUserId === "leo" || currentUserId === "bk";
      $("delete-guest-pass").style.display = isAdmin ? "none" : "block";

      $("modal-delete-guest").classList.add("active");
      setTimeout(() => {
        if (!isAdmin) {
          $("delete-guest-pass").focus();
        }
      }, 80);
    }

    function closeDeleteConfirmModal() {
      $("modal-delete-guest").classList.remove("active");
      pendingDeleteId = null;
    }

    function openPredictionModal(guestId) {
      pendingPredictionGuestId = guestId;
      const existing = getCurrentState().predictions[guestId];
      pendingPredictionWinner = existing ? existing.winner : "brazil";

      $("prediction-copy").textContent = `Palpite de ${guests[guestId].name} para Brasil x ${getCurrentMatch().opponent}.`;
      $("prediction-brazil").value = existing ? existing.brazil : "";
      $("prediction-opponent").value = existing ? existing.opponent : "";
      syncWinnerButtons();
      $("modal-prediction").classList.add("active");
      setTimeout(() => $("prediction-brazil").focus(), 80);
    }

    function closePredictionModal() {
      $("modal-prediction").classList.remove("active");
      pendingPredictionGuestId = null;
      pendingPredictionWinner = "brazil";
      syncWinnerButtons();
    }

    function openResultModal() {
      const current = getCurrentState();
      $("result-pass").value = "";
      $("result-brazil").value = current.result ? current.result.brazil : "";
      $("result-opponent").value = current.result ? current.result.opponent : "";

      const isAdmin = currentUserId === "leo" || currentUserId === "bk";
      $("result-pass").style.display = isAdmin ? "none" : "block";

      $("modal-result").classList.add("active");
      setTimeout(() => {
        if (isAdmin) {
          $("result-brazil").focus();
        } else {
          $("result-pass").focus();
        }
      }, 80);
    }

    function closeResultModal() {
      $("modal-result").classList.remove("active");
    }

    function syncWinnerButtons() {
      document.querySelectorAll(".winner-btn").forEach(button => {
        button.classList.toggle("active", button.dataset.winner === pendingPredictionWinner);
      });
    }

    function saveRsvpToFirebase(matchId) {
      if (!db) return;
      const state = matchState[matchId];
      db.ref(`matches/${matchId}/rsvp`).set({
        yes: state.yes,
        no: state.no
      });
    }

    function savePredictionsToFirebase(matchId) {
      if (!db) return;
      db.ref(`matches/${matchId}/predictions`).set(matchState[matchId].predictions || {});
    }

    function saveResultToFirebase(matchId) {
      if (!db) return;
      db.ref(`matches/${matchId}/result`).set(matchState[matchId].result || null);
    }

    function saveGuestsToFirebase() {
      if (!db) return Promise.resolve();
      return db.ref("guests/roster").set(guests);
    }

    function saveAllAfterDeletion(id) {
      MATCHES.forEach(match => {
        const state = matchState[match.id];
        state.yes = (state.yes || []).filter(guestId => guestId !== id);
        delete state.no[id];
        delete state.predictions[id];
        saveRsvpToFirebase(match.id);
        savePredictionsToFirebase(match.id);
      });
    }

    function triggerWrongPasswordAlert() {
      const alert = $("wrong-pass-alert");
      const sound = $("wrong-pass-sound");
      alert.classList.remove("show");
      void alert.offsetWidth;
      alert.classList.add("show");
      if (wrongPassTimer) clearTimeout(wrongPassTimer);
      wrongPassTimer = setTimeout(() => alert.classList.remove("show"), 1400);
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }

    function identifyUser(id) {
      if (id) {
        currentUserId = id;
        localStorage.setItem("currentGuestId", id);
      } else {
        currentUserId = null;
        localStorage.removeItem("currentGuestId");
      }
      render();
    }

    function updateIdentityBox() {
      const box = $("user-identity-box");
      if (!box) return;

      const currentGuest = currentUserId ? guests[currentUserId] : null;
      if (currentGuest) {
        const isAdmin = currentUserId === "leo" || currentUserId === "bk";
        box.innerHTML = `
          <div class="user-pill" id="user-identity-pill">
            <div class="user-avatar" style="background:${currentGuest.color}">${escapeHtml(currentGuest.first)}</div>
            <span>${escapeHtml(currentGuest.name)}${isAdmin ? " (Admin)" : ""}</span>
            <span style="font-size:0.7rem;opacity:0.6;margin-left:4px;">▼</span>
          </div>
        `;
        $("user-identity-pill").onclick = () => showSelectModal("identify", null);
      } else {
        box.innerHTML = `
          <div class="user-pill unidentified" id="user-identity-pill">
            <span>Identifique-se 👤</span>
          </div>
        `;
        $("user-identity-pill").onclick = () => showSelectModal("identify", null);
      }

      // Update admin shortcut in predictions tab
      const isUserAdmin = currentUserId === "leo" || currentUserId === "bk";
      const shortcut = $("admin-result-shortcut");
      if (shortcut) {
        shortcut.style.display = isUserAdmin ? "block" : "none";
      }
    }

    function openGuestActionsModal(id) {
      pendingActionGuestId = id;
      const guest = guests[id];
      $("actions-modal-title").textContent = `Opções para ${guest.name}`;

      const current = getCurrentState();
      const isYes = current.yes.includes(id);
      const noData = current.no[id] || null;

      $("actions-modal-sub").textContent = isYes
        ? "Presença confirmada nesta rodada."
        : noData
          ? `Presença recusada: "${noData.reason || 'Sem motivo'}"`
          : "Presença pendente (em cima do muro).";

      const isAdmin = currentUserId === "leo" || currentUserId === "bk";
      $("btn-action-delete").style.display = (isAdmin || !currentUserId) ? "block" : "none";

      const isSelf = currentUserId === id;
      const identBtn = $("btn-action-identify");
      if (isSelf) {
        identBtn.textContent = "👤 Você está identificado(a)";
        identBtn.disabled = true;
        identBtn.style.opacity = "0.5";
      } else {
        identBtn.textContent = "👤 Este sou eu (Identificar)";
        identBtn.disabled = false;
        identBtn.style.opacity = "1";
      }

      $("modal-guest-actions").classList.add("active");
    }

    function closeGuestActionsModal() {
      $("modal-guest-actions").classList.remove("active");
      pendingActionGuestId = null;
    }

    function initTabs() {
      document.querySelectorAll(".view-tab").forEach(btn => {
        btn.onclick = () => {
          switchTab(btn.dataset.tab);
        };
      });
    }

    function switchTab(tabId) {
      currentTab = tabId;
      document.querySelectorAll(".view-tab").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tabId);
      });

      $("section-rsvp").style.display = tabId === "rsvp" ? "grid" : "none";
      $("section-predictions").style.display = tabId === "predictions" ? "grid" : "none";
      $("section-leaderboard").style.display = tabId === "leaderboard" ? "grid" : "none";
    }

    function attachFirebase() {
      try {
        firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.database();
        $("status").textContent = "ao vivo";
        $("status").className = "status-pill online";
      } catch (error) {
        $("status").textContent = "modo local";
        $("status").className = "status-pill offline";
        return;
      }

      db.ref("guests/roster").on("value", snap => {
        const data = snap.val() || {};
        guests = { ...DEFAULT_GUESTS, ...data };
        MATCHES.forEach(match => normalizeMatchState(match.id));
        render();
      });

      MATCHES.forEach(match => {
        db.ref(`matches/${match.id}/rsvp`).on("value", snap => {
          const data = snap.val() || {};
          matchState[match.id].yes = Array.isArray(data.yes) ? data.yes : [];
          matchState[match.id].no = data.no || {};
          normalizeMatchState(match.id);
          if (match.id === currentMatchId) syncCurrentMatchRefs();
          render();
        });

        db.ref(`matches/${match.id}/predictions`).on("value", snap => {
          matchState[match.id].predictions = snap.val() || {};
          normalizeMatchState(match.id);
          render();
        });

        db.ref(`matches/${match.id}/result`).on("value", snap => {
          matchState[match.id].result = snap.val() || null;
          render();
        });
      });
    }

    $("decline-confirm").onclick = () => {
      const reason = $("decline-reason").value.trim();
      if (!pendingNoId) return;
      confirmedNo = { ...confirmedNo, [pendingNoId]: { reason } };
      const current = getCurrentState();
      current.no = { ...confirmedNo };
      current.yes = [...confirmedYes];

      if (reason) {
        $("sad-text").textContent = SAD_RESPONSES[Math.floor(Math.random() * SAD_RESPONSES.length)];
        $("sad-response").classList.add("show");
        setTimeout(() => {
          closeDeclineModal();
          saveRsvpToFirebase(currentMatchId);
          render();
        }, 1400);
        return;
      }

      closeDeclineModal();
      saveRsvpToFirebase(currentMatchId);
      render();
    };

    $("decline-cancel").onclick = closeDeclineModal;

    $("add-confirm").onclick = () => {
      const password = $("new-guest-pass").value.trim();
      const name = $("new-guest-name").value.trim();
      let first = $("new-guest-initials").value.trim().toUpperCase();

      const requiresPass = !currentUserId;
      if (requiresPass && password !== ADD_GUEST_PASSWORD) {
        triggerWrongPasswordAlert();
        return;
      }
      if (!name) return;
      if (!first) first = name.slice(0, 2).toUpperCase();

      const id = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      if (!id) return;

      const colorIndex = Object.keys(guests).length % GUEST_COLORS.length;
      guests = {
        ...guests,
        [id]: {
          name,
          first,
          color: guests[id]?.color || GUEST_COLORS[colorIndex]
        }
      };

      closeAddGuestModal();
      saveGuestsToFirebase().then(() => render());
    };

    $("add-cancel").onclick = closeAddGuestModal;

    $("delete-confirm").onclick = () => {
      const isAdmin = currentUserId === "leo" || currentUserId === "bk";
      if (!isAdmin) {
        const password = $("delete-guest-pass").value.trim();
        if (password !== ADD_GUEST_PASSWORD) {
          triggerWrongPasswordAlert();
          return;
        }
      }
      if (!pendingDeleteId || !guests[pendingDeleteId]) return;

      const id = pendingDeleteId;
      const newGuests = { ...guests };
      delete newGuests[id];
      guests = newGuests;

      confirmedYes = confirmedYes.filter(x => x !== id);
      const newNo = { ...confirmedNo };
      delete newNo[id];
      confirmedNo = newNo;

      const current = getCurrentState();
      current.yes = [...confirmedYes];
      current.no = { ...confirmedNo };
      delete current.predictions[id];

      closeDeleteConfirmModal();
      saveAllAfterDeletion(id);
      saveGuestsToFirebase().then(() => render());
    };

    $("delete-cancel").onclick = closeDeleteConfirmModal;

    $("prediction-confirm").onclick = () => {
      if (!pendingPredictionGuestId) return;

      const brazil = Number($("prediction-brazil").value);
      const opponent = Number($("prediction-opponent").value);

      if (Number.isNaN(brazil) || Number.isNaN(opponent)) return;

      const winner = outcomeFromScore(brazil, opponent);
      if (winner !== pendingPredictionWinner) {
        pendingPredictionWinner = winner;
        syncWinnerButtons();
      }

      const current = getCurrentState();
      current.predictions = {
        ...current.predictions,
        [pendingPredictionGuestId]: {
          brazil,
          opponent,
          winner: pendingPredictionWinner,
          updatedAt: Date.now()
        }
      };

      closePredictionModal();
      savePredictionsToFirebase(currentMatchId);
      render();
    };

    $("prediction-cancel").onclick = closePredictionModal;

    document.querySelectorAll(".winner-btn").forEach(button => {
      button.onclick = () => {
        pendingPredictionWinner = button.dataset.winner;
        syncWinnerButtons();
      };
    });

    $("result-confirm").onclick = () => {
      const isAdmin = currentUserId === "leo" || currentUserId === "bk";
      if (!isAdmin) {
        const password = $("result-pass").value.trim();
        if (password !== ADD_GUEST_PASSWORD) {
          triggerWrongPasswordAlert();
          return;
        }
      }

      const brazil = Number($("result-brazil").value);
      const opponent = Number($("result-opponent").value);
      if (Number.isNaN(brazil) || Number.isNaN(opponent)) return;

      getCurrentState().result = {
        brazil,
        opponent,
        updatedAt: Date.now()
      };

      closeResultModal();
      saveResultToFirebase(currentMatchId);
      render();
    };

    $("result-cancel").onclick = closeResultModal;

    // Action button handlers mapping with persistence/bypass logic
    $("btn-vou-ir").onclick = () => {
      if (currentUserId) {
        handleYes(currentUserId);
      } else {
        showSelectModal("yes", null);
      }
    };
    $("btn-nao-vou").onclick = () => {
      if (currentUserId) {
        handleNo(currentUserId);
      } else {
        showSelectModal("no", null);
      }
    };
    $("btn-palpite").onclick = () => {
      if (currentUserId) {
        openPredictionModal(currentUserId);
      } else {
        showSelectModal("predict", null);
      }
    };
    $("btn-result").onclick = openResultModal;
    $("btn-result-predictions-tab").onclick = openResultModal;
    $("select-cancel").onclick = closeSelectModal;

    // Wire up guest action modal buttons
    $("btn-action-yes").onclick = () => {
      if (!pendingActionGuestId) return;
      handleYes(pendingActionGuestId);
      closeGuestActionsModal();
    };
    $("btn-action-no").onclick = () => {
      if (!pendingActionGuestId) return;
      const guestId = pendingActionGuestId;
      closeGuestActionsModal();
      handleNo(guestId);
    };
    $("btn-action-predict").onclick = () => {
      if (!pendingActionGuestId) return;
      const guestId = pendingActionGuestId;
      closeGuestActionsModal();
      openPredictionModal(guestId);
    };
    $("btn-action-identify").onclick = () => {
      if (!pendingActionGuestId) return;
      identifyUser(pendingActionGuestId);
      closeGuestActionsModal();
    };
    $("btn-action-delete").onclick = () => {
      if (!pendingActionGuestId) return;
      const guestId = pendingActionGuestId;
      closeGuestActionsModal();
      openDeleteConfirmModal(guestId);
    };
    $("btn-action-cancel").onclick = closeGuestActionsModal;

    document.querySelectorAll(".modal-overlay").forEach(overlay => {
      overlay.addEventListener("click", event => {
        if (event.target === overlay) {
          overlay.classList.remove("active");
        }
      });
    });

    $("decline-reason").addEventListener("keydown", event => {
      if (event.key === "Enter") $("decline-confirm").click();
    });
    $("new-guest-pass").addEventListener("keydown", event => {
      if (event.key === "Enter") $("add-confirm").click();
    });
    $("new-guest-name").addEventListener("keydown", event => {
      if (event.key === "Enter") $("add-confirm").click();
    });
    $("new-guest-initials").addEventListener("keydown", event => {
      if (event.key === "Enter") $("add-confirm").click();
    });
    $("delete-guest-pass").addEventListener("keydown", event => {
      if (event.key === "Enter") $("delete-confirm").click();
    });
    $("prediction-brazil").addEventListener("keydown", event => {
      if (event.key === "Enter") $("prediction-confirm").click();
    });
    $("prediction-opponent").addEventListener("keydown", event => {
      if (event.key === "Enter") $("prediction-confirm").click();
    });
    $("result-pass").addEventListener("keydown", event => {
      if (event.key === "Enter") $("result-confirm").click();
    });
    $("result-brazil").addEventListener("keydown", event => {
      if (event.key === "Enter") $("result-confirm").click();
    });
    $("result-opponent").addEventListener("keydown", event => {
      if (event.key === "Enter") $("result-confirm").click();
    });

    attachFirebase();
    syncCurrentMatchRefs();
    initTabs();
    switchTab(currentTab);
    render();