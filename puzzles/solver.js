const fs = require('fs');

// ========================================================
// 1. REGRAS DO MOTOR 3X3 (Idênticas ao front-end)
// ========================================================
const parseFenToBoard = (fen) => {
    const boardStr = fen.trim().substring(1);
    const newBoard = [[null,null,null], [null,null,null], [null,null,null]];
    let idx = 0;
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const char = boardStr[idx++];
            if (char !== '.') newBoard[r][c] = { color: char === char.toUpperCase() ? 'w' : 'b', type: char.toLowerCase() };
        }
    }
    return newBoard;
};

const isPseudoLegalMove = (boardState, piece, startR, startC, endR, endC) => {
    if (!piece) return false;
    if (startR === endR && startC === endC) return false;
    const rDiff = endR - startR, cDiff = endC - startC;
    const absR = Math.abs(rDiff), absC = Math.abs(cDiff);
    const target = boardState[endR][endC];
    
    if (target && target.color === piece.color) return false;

    const isPathClear = (dr, dc) => {
        let r = startR + dr, c = startC + dc;
        while (r !== endR || c !== endC) {
            if (boardState[r][c] !== null) return false;
            r += dr; c += dc;
        }
        return true;
    };

    switch(piece.type) {
        case 'k': return absR <= 1 && absC <= 1;
        case 'n': return (absR === 2 && absC === 1) || (absR === 1 && absC === 2);
        case 'r': if (startR !== endR && startC !== endC) return false; return isPathClear(Math.sign(rDiff), Math.sign(cDiff));
        case 'b': if (absR !== absC) return false; return isPathClear(Math.sign(rDiff), Math.sign(cDiff));
        case 'q': if (startR !== endR && startC !== endC && absR !== absC) return false; return isPathClear(Math.sign(rDiff), Math.sign(cDiff));
        case 'p':
            const dir = piece.color === 'w' ? -1 : 1;
            if (cDiff === 0 && rDiff === dir && !target) return true; 
            if (absC === 1 && rDiff === dir && target) return true; 
            return false;
        default: return false;
    }
};

const simulateMoveOnBoard = (boardState, startR, startC, endR, endC, promoteTo = 'q') => {
    const nextBoard = boardState.map(row => [...row]);
    let movingPiece = { ...nextBoard[startR][startC] };
    if (movingPiece.type === 'p' && (endR === 0 || endR === 2)) movingPiece.type = promoteTo;
    nextBoard[endR][endC] = movingPiece;
    nextBoard[startR][startC] = null;
    return nextBoard;
};

const isKingInCheck = (boardState, kingColor) => {
    let kingR = -1, kingC = -1;
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const p = boardState[r][c];
            if (p && p.color === kingColor && p.type === 'k') { kingR = r; kingC = c; break; }
        }
    }
    if (kingR === -1) return true;
    const enemyColor = kingColor === 'w' ? 'b' : 'w';
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const p = boardState[r][c];
            if (p && p.color === enemyColor && isPseudoLegalMove(boardState, p, r, c, kingR, kingC)) return true;
        }
    }
    return false;
};

const getAllLegalMovesForPlayer = (boardState, color) => {
    const allMoves = [];
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const p = boardState[r][c];
            if (p && p.color === color) {
                for (let er = 0; er < 3; er++) {
                    for (let ec = 0; ec < 3; ec++) {
                        if (isPseudoLegalMove(boardState, p, r, c, er, ec)) {
                            const sim = simulateMoveOnBoard(boardState, r, c, er, ec, 'q');
                            if (!isKingInCheck(sim, color)) allMoves.push({ startR: r, startC: c, endR: er, endC: ec });
                        }
                    }
                }
            }
        }
    }
    return allMoves;
};

// ========================================================
// 2. ALGORITMO DE BUSCA (FORCED MATE)
// ========================================================
function canWhiteForceMate(board, pliesLeft) {
    let whiteMoves = getAllLegalMovesForPlayer(board, 'w');
    for (let wMove of whiteMoves) {
        let nextBoard = simulateMoveOnBoard(board, wMove.startR, wMove.startC, wMove.endR, wMove.endC, 'q');
        let blackMoves = getAllLegalMovesForPlayer(nextBoard, 'b');
        
        if (blackMoves.length === 0 && isKingInCheck(nextBoard, 'b')) return true; // Deu mate
        
        // Se as pretas ainda têm lances, verificamos se TODAS as respostas pretas levam ao mate no próximo nível
        if (pliesLeft > 1 && blackMoves.length > 0) {
            let allBlackDefensesFail = true;
            for (let bMove of blackMoves) {
                let afterBlackBoard = simulateMoveOnBoard(nextBoard, bMove.startR, bMove.startC, bMove.endR, bMove.endC, 'q');
                if (!canWhiteForceMate(afterBlackBoard, pliesLeft - 2)) {
                    allBlackDefensesFail = false;
                    break;
                }
            }
            if (allBlackDefensesFail) return true;
        }
    }
    return false;
}

function getBestMoveForWhite(board, mateInN) {
    const maxPlies = (mateInN * 2) - 1;
    let whiteMoves = getAllLegalMovesForPlayer(board, 'w');
    
    for (let wMove of whiteMoves) {
        let nextBoard = simulateMoveOnBoard(board, wMove.startR, wMove.startC, wMove.endR, wMove.endC, 'q');
        let blackMoves = getAllLegalMovesForPlayer(nextBoard, 'b');
        
        // Mate direto
        if (blackMoves.length === 0 && isKingInCheck(nextBoard, 'b')) return wMove;
        
        // Busca profunda
        if (maxPlies > 1 && blackMoves.length > 0) {
            let allBlackDefensesFail = true;
            for (let bMove of blackMoves) {
                let afterBlackBoard = simulateMoveOnBoard(nextBoard, bMove.startR, bMove.startC, bMove.endR, bMove.endC, 'q');
                if (!canWhiteForceMate(afterBlackBoard, maxPlies - 2)) {
                    allBlackDefensesFail = false;
                    break;
                }
            }
            if (allBlackDefensesFail) return wMove; // Este lance força o mate em todas as ramificações!
        }
    }
    return null;
}

const moveToString = (m) => {
    const cols = ['a','b','c']; const rows = ['3','2','1'];
    return `${cols[m.startC]}${rows[m.startR]}${cols[m.endC]}${rows[m.endR]}`;
};

// ========================================================
// 3. EXECUÇÃO DO SCRIPT: node solver.js <mateInN>
// ========================================================
const mateLevel = parseInt(process.argv[2]) || 1;
const inputFile = `matein${mateLevel.toString().padStart(2, '0')}_raw.json`;
const outputFile = `matein${mateLevel.toString().padStart(2, '0')}.json`;

if (!fs.existsSync(inputFile)) {
    console.error(`❌ Arquivo ${inputFile} não encontrado.`);
    process.exit(1);
}

console.log(`⏳ Calculando soluções para MATE EM ${mateLevel}...`);
const rawFens = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const solvedPuzzles = [];

let counter = 0;
for (let fen of rawFens) {
    if(typeof fen !== 'string') continue;
    const board = parseFenToBoard(fen);
    const bestMoveObj = getBestMoveForWhite(board, mateLevel);
    
    if (bestMoveObj) {
        solvedPuzzles.push({
            fen: fen,
            bestMove: moveToString(bestMoveObj)
        });
    }
    counter++;
    if (counter % 100 === 0) console.log(`Processados ${counter}/${rawFens.length}...`);
}

fs.writeFileSync(outputFile, JSON.stringify(solvedPuzzles, null, 2));
console.log(`✅ Concluído! Salvos ${solvedPuzzles.length} puzzles com resposta em ${outputFile}`);