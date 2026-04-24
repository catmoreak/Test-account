// Mock bank auth service — simulates a real bank's user database
// In production, replace with actual DB queries and proper password hashing

const MOCK_USERS = [
  {
    id: "MCC-001",
    username: "rahul.sharma",
    password: "bank123",
    name: "Rahul Sharma",
    role: "member",
    accountNumber: "1002003001",
    balance: 47250.75,
    savingsBalance: 12800.00,
    fdBalance: 100000.00,
    loanBalance: 45000.00,
    loanStatus: "active",
    loanProduct: "Personal Loan",
    recentTransactions: [
      { date: "2026-04-23", desc: "ATM Withdrawal - Koramangala", amount: -5000, type: "debit" },
      { date: "2026-04-22", desc: "Salary Credit", amount: 55000, type: "credit" },
      { date: "2026-04-20", desc: "Online Transfer - HDFC", amount: -12000, type: "debit" },
      { date: "2026-04-18", desc: "UPI - Swiggy", amount: -450, type: "debit" },
      { date: "2026-04-15", desc: "FD Interest Credit", amount: 1250.75, type: "credit" }
    ],
    address: "42, 2nd Cross, Jayanagar, Bengaluru - 560041",
    phone: "+91 98765 43210",
    email: "rahul.sharma@email.com",
    kycStatus: "verified",
    cardStatus: "active",
    preferredLanguage: "en"
  },
  {
    id: "MCC-002",
    username: "priya.nair",
    password: "bank123",
    name: "Priya Nair",
    role: "member",
    accountNumber: "1002003002",
    balance: 89600.50,
    savingsBalance: 25000.00,
    fdBalance: 200000.00,
    loanBalance: 0,
    loanStatus: "none",
    loanProduct: null,
    recentTransactions: [
      { date: "2026-04-24", desc: "NEFT Credit - Infosys Salary", amount: 72000, type: "credit" },
      { date: "2026-04-22", desc: "EMI - Home Loan", amount: -18500, type: "debit" },
      { date: "2026-04-20", desc: "UPI - Amazon", amount: -3200, type: "debit" },
      { date: "2026-04-17", desc: "Locker Rent Debit", amount: -1500, type: "debit" },
      { date: "2026-04-15", desc: "FD Maturity Credit", amount: 52000, type: "credit" }
    ],
    address: "15, MG Road, Ernakulam, Kerala - 682011",
    phone: "+91 98234 56789",
    email: "priya.nair@email.com",
    kycStatus: "verified",
    cardStatus: "blocked",
    preferredLanguage: "en"
  },
  {
    id: "MCC-003",
    username: "arvind.kumar",
    password: "bank123",
    name: "Arvind Kumar",
    role: "member",
    accountNumber: "1002003003",
    balance: 5420.00,
    savingsBalance: 2100.00,
    fdBalance: 0,
    loanBalance: 120000.00,
    loanStatus: "pending",
    loanProduct: "Education Loan",
    recentTransactions: [
      { date: "2026-04-23", desc: "UPI - Zomato", amount: -320, type: "debit" },
      { date: "2026-04-21", desc: "Cash Deposit", amount: 10000, type: "credit" },
      { date: "2026-04-19", desc: "College Fee Transfer", amount: -45000, type: "debit" },
      { date: "2026-04-18", desc: "Overcharge - Service Fee", amount: -500, type: "debit" },
      { date: "2026-04-15", desc: "UPI - Airtel", amount: -599, type: "debit" }
    ],
    address: "8, Ram Nagar Colony, Patna - 800001",
    phone: "+91 97654 32101",
    email: "arvind.kumar@email.com",
    kycStatus: "pending",
    cardStatus: "blocked",
    preferredLanguage: "hi"
  },
  {
    id: "STAFF-001",
    username: "staff.admin",
    password: "staff123",
    name: "Manjunath Rao",
    role: "staff",
    department: "Member Support",
    employeeId: "EMP-4501",
    preferredLanguage: "en"
  }
];

function loginUser(username, password) {
  const user = MOCK_USERS.find(
    (u) => u.username === username && u.password === password
  );
  if (!user) return null;

  // Return safe user object (no password)
  const { password: _pw, ...safeUser } = user;
  return safeUser;
}

function getUserById(id) {
  const user = MOCK_USERS.find((u) => u.id === id);
  if (!user) return null;
  const { password: _pw, ...safeUser } = user;
  return safeUser;
}

function getAccountContext(userId) {
  const user = MOCK_USERS.find((u) => u.id === userId);
  if (!user || user.role !== "member") return null;

  return {
    accountNumber: user.accountNumber,
    balance: user.balance,
    savingsBalance: user.savingsBalance,
    fdBalance: user.fdBalance,
    loanBalance: user.loanBalance,
    loanStatus: user.loanStatus,
    loanProduct: user.loanProduct,
    recentTransactions: user.recentTransactions,
    cardStatus: user.cardStatus,
    kycStatus: user.kycStatus
  };
}

module.exports = { loginUser, getUserById, getAccountContext };
