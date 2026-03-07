// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract GoldClob is ReentrancyGuard {
    uint8 private constant BUY_SIDE = 1;
    uint8 private constant SELL_SIDE = 2;

    address public immutable treasury;
    address public immutable marketMaker;
    address public immutable admin;
    uint256 public constant MAX_FEE_BPS = 10_000;
    uint256 public tradeTreasuryFeeBps;
    uint256 public tradeMarketMakerFeeBps;
    uint256 public winningsMarketMakerFeeBps;

    uint256 public nextMatchId = 1;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    enum MatchStatus {
        NULL,
        OPEN,
        RESOLVED
    }
    enum Side {
        NONE,
        YES,
        NO
    }

    struct MatchMeta {
        MatchStatus status;
        Side winner;
        uint256 yesPool;
        uint256 noPool;
    }

    struct Order {
        uint64 id;
        uint16 price; // 1 to 999. price of YES.
        bool isBuy; // buy = YES, sell = NO
        address maker;
        uint128 amount; // amount of shares
        uint128 filled;
        uint256 matchId; // which match this order belongs to
    }

    struct Position {
        uint256 yesShares;
        uint256 noShares;
    }

    struct Queue {
        uint64 head;
        uint64 tail;
        mapping(uint64 => uint64) elements;
    }

    struct OrderQuote {
        uint256 cost;
        uint256 tradeTreasuryFee;
        uint256 tradeMarketMakerFee;
        uint256 totalRequired;
        uint256 excess;
    }

    struct MatchProgress {
        uint256 remainingAmount;
        uint16 boundaryPrice;
        uint256 matchesCount;
        uint256 totalImprovement;
    }

    mapping(uint256 => MatchMeta) public matches;
    uint64 public nextOrderId = 1;
    mapping(uint64 => Order) public orders;

    // matchId => user => position
    mapping(uint256 => mapping(address => Position)) public positions;

    // matchId => side => price => queue of order IDs
    mapping(uint256 => mapping(uint8 => mapping(uint16 => Queue))) private priceQueues;

    // matchId => best price boundary
    mapping(uint256 => uint16) public bestBids;
    mapping(uint256 => uint16) public bestAsks;

    event OrderPlaced(
        uint256 indexed matchId, uint64 indexed orderId, address indexed maker, bool isBuy, uint16 price, uint256 amount
    );
    event OrderMatched(
        uint256 indexed matchId, uint64 makerOrderId, uint64 takerOrderId, uint256 matchedAmount, uint16 price
    );
    event OrderCancelled(uint256 indexed matchId, uint64 indexed orderId);
    event MatchCreated(uint256 indexed matchId);
    event MatchResolved(uint256 indexed matchId, Side winner);
    event FeeConfigUpdated(
        uint256 tradeTreasuryFeeBps, uint256 tradeMarketMakerFeeBps, uint256 winningsMarketMakerFeeBps
    );

    constructor(address _treasury, address _marketMaker) {
        require(_treasury != address(0), "Invalid treasury zero address");
        require(_marketMaker != address(0), "Invalid market maker zero address");
        treasury = _treasury;
        marketMaker = _marketMaker;
        admin = msg.sender;
        _setFeeConfig(100, 100, 200);
    }

    function _setFeeConfig(
        uint256 tradeTreasuryFeeBps_,
        uint256 tradeMarketMakerFeeBps_,
        uint256 winningsMarketMakerFeeBps_
    ) internal {
        require(tradeTreasuryFeeBps_ <= MAX_FEE_BPS, "Trade treasury fee too high");
        require(tradeMarketMakerFeeBps_ <= MAX_FEE_BPS, "Trade MM fee too high");
        require(tradeTreasuryFeeBps_ + tradeMarketMakerFeeBps_ <= MAX_FEE_BPS, "Total trade fee too high");
        require(winningsMarketMakerFeeBps_ <= MAX_FEE_BPS, "Winnings fee too high");

        tradeTreasuryFeeBps = tradeTreasuryFeeBps_;
        tradeMarketMakerFeeBps = tradeMarketMakerFeeBps_;
        winningsMarketMakerFeeBps = winningsMarketMakerFeeBps_;

        emit FeeConfigUpdated(tradeTreasuryFeeBps_, tradeMarketMakerFeeBps_, winningsMarketMakerFeeBps_);
    }

    function setFeeConfig(
        uint256 tradeTreasuryFeeBps_,
        uint256 tradeMarketMakerFeeBps_,
        uint256 winningsMarketMakerFeeBps_
    ) external onlyAdmin {
        _setFeeConfig(tradeTreasuryFeeBps_, tradeMarketMakerFeeBps_, winningsMarketMakerFeeBps_);
    }

    function feeBps() external view returns (uint256) {
        return tradeTreasuryFeeBps + tradeMarketMakerFeeBps;
    }

    function orderQueues(uint256 matchId, bool isBuy, uint16 price) external view returns (uint64 head, uint64 tail) {
        Queue storage queue = priceQueues[matchId][_sideKey(isBuy)][price];
        return (queue.head, queue.tail);
    }

    function createMatch() external onlyAdmin returns (uint256) {
        uint256 matchId = nextMatchId++;
        matches[matchId] = MatchMeta({status: MatchStatus.OPEN, winner: Side.NONE, yesPool: 0, noPool: 0});
        bestBids[matchId] = 0; // Highest bid
        bestAsks[matchId] = 1000; // Lowest ask
        emit MatchCreated(matchId);
        return matchId;
    }

    function _quoteOrder(bool isBuy, uint16 price, uint256 amount, uint256 value)
        internal
        view
        returns (OrderQuote memory quote)
    {
        uint256 priceComp = isBuy ? price : (1000 - price);
        uint256 quoteValue = amount * priceComp;
        require(quoteValue % 1000 == 0, "Amount/Price precision error");

        quote.cost = quoteValue / 1000;
        require(quote.cost > 0, "Cost too low");

        quote.tradeTreasuryFee = (quoteValue * tradeTreasuryFeeBps) / (1000 * MAX_FEE_BPS);
        quote.tradeMarketMakerFee = (quoteValue * tradeMarketMakerFeeBps) / (1000 * MAX_FEE_BPS);
        quote.totalRequired = quote.cost + quote.tradeTreasuryFee + quote.tradeMarketMakerFee;
        require(value >= quote.totalRequired, "Insufficient native currency sent");
        quote.excess = value - quote.totalRequired;
    }

    function _matchBuyOrder(uint256 matchId, uint16 limitPrice, uint256 amount, uint64 takerOrderId)
        internal
        returns (MatchProgress memory progress)
    {
        uint256 maxMatchesPerTx = 100;
        uint16 currentAsk = bestAsks[matchId];

        progress.remainingAmount = amount;
        progress.boundaryPrice = currentAsk;

        while (
            progress.remainingAmount > 0
                && progress.boundaryPrice <= limitPrice
                && progress.boundaryPrice < 1000
                && progress.matchesCount < maxMatchesPerTx
        ) {
            Queue storage queue = priceQueues[matchId][SELL_SIDE][progress.boundaryPrice];
            if (queue.head == queue.tail) {
                progress.boundaryPrice++;
                continue;
            }

            uint64 orderId = queue.elements[queue.head];
            Order storage makerOrder = orders[orderId];
            require(!makerOrder.isBuy, "Queue side corrupted");

            if (makerOrder.filled >= makerOrder.amount) {
                _popQueue(matchId, SELL_SIDE, progress.boundaryPrice);
                progress.matchesCount++;
                continue;
            }

            uint256 fillAmount = progress.remainingAmount;
            uint256 makerRemaining = makerOrder.amount - makerOrder.filled;
            if (fillAmount > makerRemaining) {
                fillAmount = makerRemaining;
            }

            makerOrder.filled += uint128(fillAmount);
            progress.remainingAmount -= fillAmount;

            positions[matchId][makerOrder.maker].noShares += fillAmount;
            positions[matchId][msg.sender].yesShares += fillAmount;

            if (limitPrice > progress.boundaryPrice) {
                uint256 improvement = (fillAmount * (limitPrice - progress.boundaryPrice)) / 1000;
                if (improvement > 0) {
                    progress.totalImprovement += improvement;
                }
            }

            emit OrderMatched(matchId, orderId, takerOrderId, fillAmount, progress.boundaryPrice);

            if (makerOrder.filled == makerOrder.amount) {
                _popQueue(matchId, SELL_SIDE, progress.boundaryPrice);
            }

            progress.matchesCount++;
        }
    }

    function _matchSellOrder(uint256 matchId, uint16 limitPrice, uint256 amount, uint64 takerOrderId)
        internal
        returns (MatchProgress memory progress)
    {
        uint256 maxMatchesPerTx = 100;
        uint16 currentBid = bestBids[matchId];

        progress.remainingAmount = amount;
        progress.boundaryPrice = currentBid;

        while (
            progress.remainingAmount > 0
                && progress.boundaryPrice >= limitPrice
                && progress.boundaryPrice > 0
                && progress.matchesCount < maxMatchesPerTx
        ) {
            Queue storage queue = priceQueues[matchId][BUY_SIDE][progress.boundaryPrice];
            if (queue.head == queue.tail) {
                progress.boundaryPrice--;
                continue;
            }

            uint64 orderId = queue.elements[queue.head];
            Order storage makerOrder = orders[orderId];
            require(makerOrder.isBuy, "Queue side corrupted");

            if (makerOrder.filled >= makerOrder.amount) {
                _popQueue(matchId, BUY_SIDE, progress.boundaryPrice);
                progress.matchesCount++;
                continue;
            }

            uint256 fillAmount = progress.remainingAmount;
            uint256 makerRemaining = makerOrder.amount - makerOrder.filled;
            if (fillAmount > makerRemaining) {
                fillAmount = makerRemaining;
            }

            makerOrder.filled += uint128(fillAmount);
            progress.remainingAmount -= fillAmount;

            positions[matchId][makerOrder.maker].yesShares += fillAmount;
            positions[matchId][msg.sender].noShares += fillAmount;

            if (progress.boundaryPrice > limitPrice) {
                uint256 improvement = (fillAmount * (progress.boundaryPrice - limitPrice)) / 1000;
                if (improvement > 0) {
                    progress.totalImprovement += improvement;
                }
            }

            emit OrderMatched(matchId, orderId, takerOrderId, fillAmount, progress.boundaryPrice);

            if (makerOrder.filled == makerOrder.amount) {
                _popQueue(matchId, BUY_SIDE, progress.boundaryPrice);
            }

            progress.matchesCount++;
        }
    }

    function _restOrder(uint256 matchId, bool isBuy, uint16 price, uint256 amount) internal {
        uint64 newOrderId = nextOrderId++;
        orders[newOrderId] = Order({
            id: newOrderId,
            price: price,
            isBuy: isBuy,
            maker: msg.sender,
            amount: uint128(amount),
            filled: 0,
            matchId: matchId
        });

        Queue storage queue = priceQueues[matchId][_sideKey(isBuy)][price];
        queue.elements[queue.tail] = newOrderId;
        queue.tail++;

        if (isBuy && price > bestBids[matchId]) {
            bestBids[matchId] = price;
        } else if (!isBuy && price < bestAsks[matchId]) {
            bestAsks[matchId] = price;
        }

        emit OrderPlaced(matchId, newOrderId, msg.sender, isBuy, price, amount);
    }

    function _settleOrderValue(OrderQuote memory quote, uint256 totalImprovement) internal {
        if (quote.tradeTreasuryFee > 0) {
            _sendNative(treasury, quote.tradeTreasuryFee);
        }
        if (quote.tradeMarketMakerFee > 0) {
            _sendNative(marketMaker, quote.tradeMarketMakerFee);
        }
        if (totalImprovement > 0) {
            _sendNative(msg.sender, totalImprovement);
        }
        if (quote.excess > 0) {
            _sendNative(msg.sender, quote.excess);
        }
    }

    function placeOrder(uint256 matchId, bool isBuy, uint16 price, uint256 amount) external payable nonReentrant {
        require(matches[matchId].status == MatchStatus.OPEN, "Match not open");
        require(price > 0 && price < 1000, "Invalid price");
        require(amount > 0, "Invalid amount");
        require(amount <= type(uint128).max, "Amount overflow");

        OrderQuote memory quote = _quoteOrder(isBuy, price, amount, msg.value);
        uint64 takerOrderId = nextOrderId;
        MatchProgress memory progress =
            isBuy ? _matchBuyOrder(matchId, price, amount, takerOrderId) : _matchSellOrder(matchId, price, amount, takerOrderId);

        if (isBuy) {
            bestAsks[matchId] = progress.boundaryPrice;
        } else {
            bestBids[matchId] = progress.boundaryPrice;
        }

        if (progress.remainingAmount > 0) {
            _restOrder(matchId, isBuy, price, progress.remainingAmount);
        }

        _settleOrderValue(quote, progress.totalImprovement);
    }

    function _sideKey(bool isBuy) internal pure returns (uint8) {
        return isBuy ? BUY_SIDE : SELL_SIDE;
    }

    function _popQueue(uint256 matchId, uint8 sideKey, uint16 price) internal {
        Queue storage queue = priceQueues[matchId][sideKey][price];
        delete queue.elements[queue.head];
        queue.head++;
    }

    function cancelOrder(uint256 matchId, uint64 orderId, uint16 /*price*/ ) external nonReentrant {
        Order storage orderInfo = orders[orderId];
        require(orderInfo.maker == msg.sender, "Not maker");
        require(orderInfo.matchId == matchId, "Wrong match");
        require(orderInfo.filled < orderInfo.amount, "Already filled");

        uint256 remaining = orderInfo.amount - orderInfo.filled;
        orderInfo.filled = orderInfo.amount; // Mark as effectively cancelled/filled

        uint256 priceComp = orderInfo.isBuy ? orderInfo.price : (1000 - orderInfo.price);
        uint256 cost = (remaining * priceComp) / 1000;
        if (cost > 0) {
            _sendNative(msg.sender, cost);
        }

        emit OrderCancelled(matchId, orderId);
    }

    function resolveMatch(uint256 matchId, Side winner) external onlyAdmin {
        require(matches[matchId].status == MatchStatus.OPEN, "Not open");
        require(winner == Side.YES || winner == Side.NO, "Invalid winner");
        matches[matchId].status = MatchStatus.RESOLVED;
        matches[matchId].winner = winner;
        emit MatchResolved(matchId, winner);
    }

    function claim(uint256 matchId) external nonReentrant {
        require(matches[matchId].status == MatchStatus.RESOLVED, "Not resolved");
        Position storage pos = positions[matchId][msg.sender];
        Side winner = matches[matchId].winner;

        uint256 winningShares = 0;
        if (winner == Side.YES) {
            winningShares = pos.yesShares;
            pos.yesShares = 0;
        } else if (winner == Side.NO) {
            winningShares = pos.noShares;
            pos.noShares = 0;
        }

        require(winningShares > 0, "Nothing to claim");

        uint256 fee = (winningShares * winningsMarketMakerFeeBps) / MAX_FEE_BPS;
        uint256 payout = winningShares - fee;

        if (fee > 0) {
            _sendNative(marketMaker, fee);
        }
        _sendNative(msg.sender, payout);
    }

    // OOG DoS Fix: Allow sweeping of dead/cancelled orders from the queue manually
    function clearGarbage(uint256 matchId, bool isBuy, uint16 price, uint256 maxOrders) external nonReentrant {
        require(matches[matchId].status == MatchStatus.OPEN, "Match not open");
        Queue storage queue = priceQueues[matchId][_sideKey(isBuy)][price];
        uint256 cleared = 0;

        while (queue.head < queue.tail && cleared < maxOrders) {
            uint64 orderId = queue.elements[queue.head];
            Order storage makerOrder = orders[orderId];
            if (makerOrder.filled >= makerOrder.amount) {
                _popQueue(matchId, _sideKey(isBuy), price);
                cleared++;
            } else {
                break;
            }
        }
    }

    function _sendNative(address to, uint256 amount) internal {
        Address.sendValue(payable(to), amount);
    }

    // Allow contract to receive native currency
    receive() external payable {}
}
