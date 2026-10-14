import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CalendarDays, Check, ChevronDown,
  CircleHelp, CreditCard, Download, Eye, EyeOff, LayoutDashboard, LogOut,
  Moon, MoreHorizontal, Plus, Search, Settings, Sparkles, Sun, Tags, Trash2,
  TrendingDown, TrendingUp, Wallet, X, Pencil, Mail, Lock, UserRound, Landmark,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Toaster, toast } from 'sonner'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type Kind = 'income' | 'expense'
type Category = { id: string; user_id: string; name: string; type: Kind; color: string; created_at?: string }
type Transaction = { id: string; user_id: string; category_id: string | null; type: Kind; description: string; amount: number; date: string; created_at?: string }
type Page = 'dashboard' | 'transactions' | 'categories' | 'settings'
const palette = ['#a4e879', '#8d7cff', '#ffad83', '#6fd6c8', '#f28fbd', '#7db2ff', '#e8cc73', '#a7a8ba']
const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0)
const dateBR = (s: string) => { try { return format(parseISO(s), 'dd/MM/yyyy', { locale: ptBR }) } catch { return s } }
const monthName = (s: string) => { try { return format(parseISO(s + '-01'), 'MMMM yyyy', { locale: ptBR }) } catch { return s } }
const deltaLabel = (current: number, previous: number) => previous === 0 ? (current === 0 ? 'Sem movimentação anterior' : 'Novo neste período') : `${current >= previous ? '↑' : '↓'} ${Math.abs(((current - previous) / Math.abs(previous)) * 100).toFixed(0)}% vs. mês anterior`
const todayISO = () => format(new Date(), 'yyyy-MM-dd')
const amountValue = (s: string) => Number(s.replace(/[^0-9]/g, '')) / 100
const amountMask = (s: string) => {
  const digits = s.replace(/\D/g, '')
  return (Number(digits || '0') / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [user, setUser] = useState<{ id: string; email?: string; user_metadata?: Record<string, unknown> } | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authName, setAuthName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | Kind>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryType, setCategoryType] = useState<Kind>('expense')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return localStorage.getItem('finflow-theme') === 'light' ? 'light' : 'dark' } catch { return 'dark' }
  })
  const [form, setForm] = useState({ type: 'expense' as Kind, description: '', amount: '', category_id: '', date: todayISO() })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('finflow-theme', theme) } catch { /* storage may be unavailable */ }
  }, [theme])

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return }
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setUser(data.session?.user ?? null); setAuthReady(true) }
    }).catch(() => { if (active) setAuthReady(true) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setAuthReady(true)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  const refresh = useCallback(async () => {
    if (!supabase || !user) return
    setLoading(true)
    const [cats, txs] = await Promise.all([
      supabase.from('categories').select('*').order('type').order('name'),
      supabase.from('transactions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
    ])
    if (cats.error) toast.error('Não foi possível carregar as categorias.')
    else setCategories((cats.data ?? []) as Category[])
    if (txs.error) toast.error('Não foi possível carregar os lançamentos.')
    else setTransactions((txs.data ?? []) as Transaction[])
    setLoading(false)
  }, [user])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey && !typing && user) {
        event.preventDefault()
        openNewTransaction()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [user, categories])

  const monthTransactions = useMemo(() => transactions.filter(t => t.date.startsWith(month)), [transactions, month])
  const previousMonth = useMemo(() => { const d = parseISO(month + '-01'); d.setMonth(d.getMonth() - 1); return format(d, 'yyyy-MM') }, [month])
  const previousTransactions = useMemo(() => transactions.filter(t => t.date.startsWith(previousMonth)), [transactions, previousMonth])
  const income = monthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const expense = monthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
  const balance = income - expense
  const previousIncome = previousTransactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const previousExpense = previousTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
  const previousBalance = previousIncome - previousExpense
  const filteredTransactions = useMemo(() => transactions.filter(t =>
    t.date.startsWith(month) &&
    (typeFilter === 'all' || t.type === typeFilter) &&
    (t.description.toLowerCase().includes(search.toLowerCase()) ||
      (categories.find(c => c.id === t.category_id)?.name ?? '').toLowerCase().includes(search.toLowerCase()))
  ), [transactions, month, typeFilter, search, categories])
  const chartDays = useMemo(() => {
    const first = startOfMonth(parseISO(month + '-01'))
    const last = endOfMonth(first)
    return eachDayOfInterval({ start: first, end: last }).map(day => {
      const dayTxs = monthTransactions.filter(t => isSameDay(parseISO(t.date), day))
      return { day: format(day, 'dd'), ganhos: dayTxs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0), gastos: dayTxs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0) }
    })
  }, [month, monthTransactions])
  const categoryChart = useMemo(() => categories.filter(c => c.type === 'expense').map(c => ({
    name: c.name, value: monthTransactions.filter(t => t.type === 'expense' && t.category_id === c.id).reduce((s, t) => s + Number(t.amount), 0), color: c.color,
  })).filter(c => c.value > 0).sort((a, b) => b.value - a.value), [categories, monthTransactions])

  async function submitAuth(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    if (authPassword.length < 6) { toast.error('A senha precisa ter pelo menos 6 caracteres.'); return }
    setLoading(true)
    const result = authMode === 'login'
      ? await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword })
      : await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword, options: { data: { full_name: authName.trim() } } })
    setLoading(false)
    if (result.error) { toast.error(result.error.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : result.error.message); return }
    if (authMode === 'register' && !result.data.session) toast.success('Conta criada! Confira seu e-mail para confirmar o cadastro.')
    else toast.success(authMode === 'login' ? 'Bem-vindo de volta!' : 'Conta criada com sucesso!')
  }

  async function googleLogin() {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (error) toast.error('Não foi possível iniciar o login com Google.')
  }

  async function logout() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) toast.error('Não foi possível sair da conta.')
    else { setTransactions([]); setCategories([]); setPage('dashboard'); toast.success('Você saiu da sua conta.') }
  }

  function openNewTransaction(kind: Kind = 'expense') {
    setEditing(null)
    setForm({ type: kind, description: '', amount: '', category_id: categories.find(c => c.type === kind)?.id ?? '', date: todayISO() })
    setModalOpen(true)
  }
  function openEditTransaction(t: Transaction) {
    setEditing(t)
    setForm({ type: t.type, description: t.description, amount: Number(t.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), category_id: t.category_id ?? '', date: t.date })
    setModalOpen(true)
  }
  async function saveTransaction(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user) return
    const amount = amountValue(form.amount)
    if (!form.description.trim() || amount <= 0 || !Number.isFinite(amount)) { toast.error('Preencha a descrição e informe um valor válido.'); return }
    setLoading(true)
    const payload = { user_id: user.id, type: form.type, description: form.description.trim(), amount, category_id: form.category_id || null, date: form.date }
    const result = editing
      ? await supabase.from('transactions').update(payload).eq('id', editing.id).select().single()
      : await supabase.from('transactions').insert(payload).select().single()
    setLoading(false)
    if (result.error) { toast.error('Não foi possível salvar. Confira se o SQL do Supabase foi executado.'); return }
    toast.success(editing ? 'Lançamento atualizado!' : 'Lançamento adicionado!')
    setModalOpen(false)
    await refresh()
  }
  async function deleteTransaction(id: string) {
    if (!supabase || !window.confirm('Deseja excluir este lançamento? Essa ação não pode ser desfeita.')) return
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) toast.error('Não foi possível excluir o lançamento.')
    else { setTransactions(old => old.filter(t => t.id !== id)); toast.success('Lançamento excluído.') }
  }
  async function addCategory(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !user || !categoryName.trim()) return
    const { data, error } = await supabase.from('categories').insert({ user_id: user.id, name: categoryName.trim(), type: categoryType, color: palette[categories.length % palette.length] }).select().single()
    if (error) { toast.error(error.message.includes('duplicate') ? 'Já existe uma categoria com esse nome e tipo.' : 'Não foi possível criar a categoria.'); return }
    setCategories(old => [...old, data as Category].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
    setCategoryName('')
    toast.success('Categoria criada!')
  }
  async function renameCategory(c: Category) {
    if (!supabase || !user) return
    const proposed = window.prompt('Novo nome para a categoria', c.name)
    if (proposed === null || !proposed.trim() || proposed.trim() === c.name) return
    const { data, error } = await supabase.from('categories').update({ name: proposed.trim() }).eq('id', c.id).select().single()
    if (error) { toast.error(error.message.includes('duplicate') ? 'Já existe uma categoria com esse nome e tipo.' : 'Não foi possível renomear a categoria.'); return }
    setCategories(old => old.map(item => item.id === c.id ? data as Category : item).sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')))
    toast.success('Categoria atualizada!')
  }
  async function deleteCategory(c: Category) {
    if (!supabase || !window.confirm(`Excluir a categoria "${c.name}"? Os lançamentos relacionados ficarão sem categoria.`)) return
    const { error } = await supabase.from('categories').delete().eq('id', c.id)
    if (error) toast.error('Não foi possível excluir a categoria.')
    else { setCategories(old => old.filter(item => item.id !== c.id)); await refresh(); toast.success('Categoria excluída.') }
  }
  function exportCsv() {
    const rows = [['Data', 'Descrição', 'Tipo', 'Categoria', 'Valor'], ...filteredTransactions.map(t => [t.date, t.description, t.type === 'income' ? 'Ganho' : 'Gasto', categories.find(c => c.id === t.category_id)?.name ?? 'Sem categoria', Number(t.amount).toFixed(2).replace('.', ',')])]
    const csv = '\uFEFF' + rows.map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = `finflow-lancamentos-${month}.csv`; a.click(); URL.revokeObjectURL(url)
    toast.success('Arquivo CSV exportado!')
  }

  if (!authReady) return <div className="boot-screen"><div className="brand-mark"><Wallet size={23} /></div><span>Preparando seu espaço financeiro…</span></div>
  if (!isSupabaseConfigured || !supabase) return <div className="setup-screen"><div className="brand-mark"><Wallet size={26} /></div><p className="eyebrow">FINFLOW · CONFIGURAÇÃO INICIAL</p><h1>Vamos conectar seu financeiro.</h1><p>Para entrar no sistema, configure as credenciais públicas do seu projeto Supabase no arquivo <code>.env.local</code>.</p><div className="setup-code"><code>VITE_SUPABASE_URL=https://seu-projeto.supabase.co</code><code>VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...</code></div><p className="muted">Depois, reinicie o servidor com <code>npm run dev</code>. Nunca use uma chave <code>service_role</code> no frontend.</p></div>
  if (!user) return <main className="auth-layout"><div className="auth-art"><div className="auth-brand"><div className="brand-mark"><Wallet size={24} /></div><span>finflow<span className="brand-dot">.</span></span></div><div className="auth-message"><p className="eyebrow">SUA VIDA FINANCEIRA, MAIS LEVE</p><h1>Clareza para cuidar melhor do seu dinheiro.</h1><p>Organize seus ganhos, entenda seus gastos e tome decisões com mais confiança.</p><div className="auth-mini-stats"><div><span>Visão completa</span><strong>em um só lugar</strong></div><div><span>Mais controle</span><strong>todo mês</strong></div></div></div><div className="auth-art-footer">Seu dinheiro. Suas escolhas. Seu futuro.</div></div><section className="auth-panel"><div className="auth-form-wrap"><div className="mobile-brand"><div className="brand-mark"><Wallet size={22} /></div><strong>finflow<span className="brand-dot">.</span></strong></div><p className="eyebrow">{authMode === 'login' ? 'BOM TER VOCÊ DE VOLTA' : 'COMECE SUA ORGANIZAÇÃO'}</p><h2>{authMode === 'login' ? 'Acesse sua conta' : 'Crie sua conta'}</h2><p className="muted">{authMode === 'login' ? 'Entre para acompanhar sua vida financeira.' : 'É rápido e você já pode começar.'}</p><form onSubmit={submitAuth} className="auth-form">{authMode === 'register' && <label>Seu nome<div className="input-wrap"><UserRound size={17} /><input value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Como podemos te chamar?" required /></div></label>}<label>E-mail<div className="input-wrap"><Mail size={17} /><input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" required /></div></label><label>Senha<div className="input-wrap"><Lock size={17} /><input type={showPassword ? 'text' : 'password'} value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Mínimo de 6 caracteres" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} required minLength={6} /><button type="button" className="icon-button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label><button className="primary-button full" disabled={loading}>{loading ? 'Aguarde…' : authMode === 'login' ? 'Entrar na minha conta' : 'Criar minha conta'} <ArrowUpRight size={17} /></button></form><div className="auth-divider"><span />ou continue com<span /></div><button className="google-button" onClick={googleLogin}><span className="google-g">G</span> Continuar com Google</button><p className="auth-switch">{authMode === 'login' ? 'Ainda não tem uma conta?' : 'Já tem uma conta?'} <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? 'Criar conta grátis' : 'Fazer login'}</button></p><p className="privacy-note">Ao continuar, seus dados financeiros ficam vinculados à sua conta e protegidos pelas políticas de acesso.</p></div></section><Toaster theme={theme} richColors position="top-right" /></main>

  const nav = [{ id: 'dashboard' as Page, label: 'Visão geral', icon: LayoutDashboard }, { id: 'transactions' as Page, label: 'Lançamentos', icon: ArrowLeftRight }, { id: 'categories' as Page, label: 'Categorias', icon: Tags }, { id: 'settings' as Page, label: 'Configurações', icon: Settings }]
  const displayName = String(user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Usuário')

  return <div className="app-shell">
    <aside className="sidebar"><div className="sidebar-brand"><div className="brand-mark"><Wallet size={22} /></div><span>finflow<span className="brand-dot">.</span></span></div><div className="workspace-label">ESPAÇO PESSOAL</div><nav className="side-nav">{nav.map(item => <button key={item.id} className={page === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(item.id)}><item.icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{page === item.id && <span className="nav-indicator" />}</button>)}</nav><div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Sparkles size={17} /></div><strong>Pequenos passos, grandes mudanças.</strong><span>Uma vida financeira mais tranquila começa com clareza.</span></div><button className="user-card" onClick={() => setPage('settings')}><div className="avatar">{displayName.charAt(0).toUpperCase()}</div><div className="user-meta"><strong>{displayName}</strong><span>{user.email}</span></div><MoreHorizontal size={18} /></button></div></aside>
    <main className="main-area"><header className="topbar"><div className="topbar-left"><div className="mobile-brand"><div className="brand-mark"><Wallet size={20} /></div><strong>finflow<span className="brand-dot">.</span></strong></div><div className="breadcrumb"><span>FinFlow</span><span className="breadcrumb-slash">/</span><strong>{nav.find(n => n.id === page)?.label}</strong></div></div><div className="topbar-actions"><button className="month-select" onClick={() => { const input = document.getElementById('month-picker') as HTMLInputElement | null; input?.showPicker?.(); input?.focus() }}><CalendarDays size={16} /><span>{monthName(month)}</span><ChevronDown size={15} /><input id="month-picker" aria-label="Selecionar mês" type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></button><button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Alternar tema">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button><button className="avatar top-avatar" onClick={() => setPage('settings')} aria-label="Abrir configurações">{displayName.charAt(0).toUpperCase()}</button></div></header>
    <div className="page-content">{page === 'dashboard' && <><div className="page-heading"><div><p className="eyebrow">SEU RESUMO FINANCEIRO</p><h1>Visão geral<span className="heading-period">.</span></h1><p className="muted">Aqui está o panorama do seu dinheiro em {monthName(month)}.</p></div><button className="primary-button" onClick={() => openNewTransaction()}><Plus size={18} /> Novo lançamento</button></div>
      <div className="stats-grid"><StatCard label="Total de ganhos" amount={income} icon={<ArrowDownLeft size={19} />} tone="green" helper={monthTransactions.filter(t => t.type === 'income').length + ' lançamentos · ' + deltaLabel(income, previousIncome)} /><StatCard label="Total de gastos" amount={expense} icon={<ArrowUpRight size={19} />} tone="red" helper={monthTransactions.filter(t => t.type === 'expense').length + ' lançamentos · ' + deltaLabel(expense, previousExpense)} /><StatCard label="Saldo do período" amount={balance} icon={<Wallet size={19} />} tone="purple" helper={deltaLabel(balance, previousBalance)} /><div className="stat-card savings-card"><div className="stat-top"><span>Taxa de economia</span><span className="stat-icon green"><TrendingUp size={19} /></span></div><div className="stat-value">{income > 0 ? Math.round((balance / income) * 100) : 0}%</div><div className="progress-track"><div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, income > 0 ? (balance / income) * 100 : 0))}%` }} /></div><span className="stat-helper">Da sua renda que ficou com você</span></div></div>
      <div className="dashboard-grid"><section className="panel chart-panel"><div className="panel-heading"><div><h3>Fluxo financeiro</h3><p>Ganhos e gastos ao longo do mês</p></div><span className="chart-legend"><i className="legend-income" /> Ganhos <i className="legend-expense" /> Gastos</span></div><div className="bar-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartDays} margin={{ top: 10, right: 2, left: -18, bottom: 0 }} barGap={3}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} interval={Math.max(0, Math.floor(chartDays.length / 8) - 1)} /><YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} tickFormatter={v => v >= 1000 ? `R$${(v / 1000).toLocaleString('pt-BR')}k` : String(v)} /><Tooltip formatter={(value) => brl(Number(value))} labelFormatter={v => `Dia ${v}`} contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' }} /><Bar dataKey="ganhos" name="Ganhos" fill="#a4e879" radius={[4, 4, 0, 0]} isAnimationActive={false} /><Bar dataKey="gastos" name="Gastos" fill="#ff998c" radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div></section>
      <section className="panel category-panel"><div className="panel-heading"><div><h3>Gastos por categoria</h3><p>Onde seu dinheiro está indo</p></div><button className="subtle-icon" onClick={() => setPage('categories')} aria-label="Ver categorias"><ArrowUpRight size={17} /></button></div>{categoryChart.length ? <><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryChart} dataKey="value" nameKey="name" innerRadius={61} outerRadius={85} paddingAngle={3} stroke="none" isAnimationActive={false}>{categoryChart.map((c, i) => <Cell key={c.name} fill={c.color || palette[i % palette.length]} />)}</Pie><Tooltip formatter={(v) => brl(Number(v))} contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12 }} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{brl(expense)}</strong><span>Total gasto</span></div></div><div className="category-legend">{categoryChart.slice(0, 5).map((c, i) => <div key={c.name} className="category-legend-row"><span className="category-dot" style={{ background: c.color || palette[i % palette.length] }} /><span>{c.name}</span><strong>{brl(c.value)}</strong></div>)}</div></> : <EmptyState icon={<Tags size={22} />} title="Sem gastos por aqui" text="Adicione um lançamento de gasto para ver sua distribuição." />}</section></div>
      <section className="panel recent-panel"><div className="panel-heading"><div><h3>Lançamentos recentes</h3><p>As últimas movimentações do período</p></div><button className="text-button" onClick={() => setPage('transactions')}>Ver todos <ArrowUpRight size={15} /></button></div><TransactionTable items={monthTransactions.slice(0, 5)} categories={categories} onEdit={openEditTransaction} onDelete={deleteTransaction} /></section>
    </>}
    {page === 'transactions' && <><div className="page-heading"><div><p className="eyebrow">ENTRADAS E SAÍDAS</p><h1>Lançamentos<span className="heading-period">.</span></h1><p className="muted">Tudo o que entra e sai, organizado em um só lugar.</p></div><button className="primary-button" onClick={() => openNewTransaction()}><Plus size={18} /> Novo lançamento</button></div><div className="transaction-summary"><div><span>Ganhos no mês</span><strong className="text-green">{brl(income)}</strong></div><div><span>Gastos no mês</span><strong className="text-red">{brl(expense)}</strong></div><div><span>Saldo do mês</span><strong>{brl(balance)}</strong></div></div><section className="panel transactions-panel"><div className="filters"><div className="search-field"><Search size={17} /><input placeholder="Buscar descrição ou categoria..." value={search} onChange={e => setSearch(e.target.value)} /></div><select value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'all' | Kind)} aria-label="Filtrar tipo"><option value="all">Todos os tipos</option><option value="income">Ganhos</option><option value="expense">Gastos</option></select><button className="secondary-button" onClick={exportCsv}><Download size={16} /> Exportar CSV</button></div><TransactionTable items={filteredTransactions} categories={categories} onEdit={openEditTransaction} onDelete={deleteTransaction} /></section></>}
    {page === 'categories' && <><div className="page-heading"><div><p className="eyebrow">ORGANIZE SUAS MOVIMENTAÇÕES</p><h1>Categorias<span className="heading-period">.</span></h1><p className="muted">Personalize as categorias para refletir sua rotina.</p></div></div><div className="category-management-grid"><section className="panel category-create"><div className="panel-heading"><div><h3>Nova categoria</h3><p>Crie um grupo para seus lançamentos</p></div><div className="panel-icon"><Plus size={18} /></div></div><form onSubmit={addCategory} className="category-form"><label>Nome da categoria<input value={categoryName} onChange={e => setCategoryName(e.target.value)} placeholder="Ex.: Educação, Pets..." maxLength={60} required /></label><label>Tipo de movimentação<select value={categoryType} onChange={e => setCategoryType(e.target.value as Kind)}><option value="expense">Gasto</option><option value="income">Ganho</option></select></label><button className="primary-button full"><Plus size={17} /> Criar categoria</button></form></section><div className="category-columns">{(['income', 'expense'] as Kind[]).map(kind => <section className="panel category-list-panel" key={kind}><div className="panel-heading"><div><h3>{kind === 'income' ? 'Ganhos' : 'Gastos'}</h3><p>{categories.filter(c => c.type === kind).length} categorias</p></div><span className={kind === 'income' ? 'stat-icon green' : 'stat-icon red'}>{kind === 'income' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}</span></div>{categories.filter(c => c.type === kind).map((c, i) => <div className="managed-category" key={c.id}><span className="category-dot large" style={{ background: c.color || palette[i % palette.length] }} /><span>{c.name}</span><span className="category-usage">{transactions.filter(t => t.category_id === c.id && t.date.startsWith(month)).length} lanç. · {brl(transactions.filter(t => t.category_id === c.id && t.date.startsWith(month)).reduce((sum, t) => sum + Number(t.amount), 0))}</span><button className="subtle-icon" onClick={() => void renameCategory(c)} aria-label={`Renomear categoria ${c.name}`}><Pencil size={15} /></button><button className="subtle-icon danger-hover" onClick={() => void deleteCategory(c)} aria-label={`Excluir categoria ${c.name}`}><Trash2 size={16} /></button></div>)}</section>)}</div></div></>}
    {page === 'settings' && <><div className="page-heading"><div><p className="eyebrow">SUA CONTA, SUAS PREFERÊNCIAS</p><h1>Configurações<span className="heading-period">.</span></h1><p className="muted">Gerencie sua conta e personalize sua experiência.</p></div></div><div className="settings-grid"><section className="panel settings-panel"><div className="panel-heading"><div><h3>Seu perfil</h3><p>Informações da sua conta</p></div><div className="panel-icon"><UserRound size={18} /></div></div><div className="profile-row"><div className="avatar profile-avatar">{displayName.charAt(0).toUpperCase()}</div><div><strong>{displayName}</strong><span>{user.email}</span><small>Conta pessoal</small></div></div><div className="setting-line"><div><strong>Conta autenticada</strong><span>Seu acesso está protegido pelo Supabase Auth.</span></div><span className="status-pill"><Check size={13} /> Ativa</span></div><div className="setting-line"><div><strong>Aparência</strong><span>Escolha como o FinFlow aparece para você.</span></div><button className="secondary-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</button></div><div className="setting-line"><div><strong>Exportar lançamentos</strong><span>Baixe os lançamentos filtrados em CSV.</span></div><button className="secondary-button" onClick={exportCsv}><Download size={16} /> Exportar CSV</button></div><div className="setting-line"><div><strong>Sair da conta</strong><span>Encerre sua sessão neste dispositivo.</span></div><button className="secondary-button danger-button" onClick={() => void logout()}><LogOut size={16} /> Sair</button></div></section><section className="panel settings-stats"><div className="panel-heading"><div><h3>Seu panorama</h3><p>Resumo de toda sua jornada</p></div><div className="panel-icon"><Landmark size={18} /></div></div><div className="lifetime-stat"><span>Total de lançamentos</span><strong>{transactions.length}</strong></div><div className="lifetime-stat"><span>Categorias criadas</span><strong>{categories.length}</strong></div><div className="lifetime-stat"><span>Ganhos registrados</span><strong className="text-green">{brl(transactions.filter(t => t.type === 'income').reduce((s,t) => s + Number(t.amount),0))}</strong></div><div className="lifetime-stat"><span>Gastos registrados</span><strong className="text-red">{brl(transactions.filter(t => t.type === 'expense').reduce((s,t) => s + Number(t.amount),0))}</strong></div></section></div></>}
    {loading && <div className="loading-indicator"><span /> Atualizando seus dados…</div>}
    <footer className="app-footer"><span>FinFlow <span className="brand-dot">.</span> Seu financeiro em ordem.</span><span><CircleHelp size={14} /> Feito para trazer clareza ao seu dinheiro.</span></footer>
    </div></main>
    <button className="floating-add" onClick={() => openNewTransaction()} aria-label="Novo lançamento" title="Novo lançamento (N)"><Plus size={22} /></button>
    <nav className="mobile-nav">{nav.map(item => <button key={item.id} className={page === item.id ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => setPage(item.id)}><item.icon size={19} /><span>{item.label}</span></button>)}</nav>
    {modalOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModalOpen(false) }}><section className="transaction-modal"><div className="modal-heading"><div><p className="eyebrow">{editing ? 'ATUALIZE OS DETALHES' : 'REGISTRE SUA MOVIMENTAÇÃO'}</p><h2>{editing ? 'Editar lançamento' : 'Novo lançamento'}</h2></div><button className="subtle-icon" onClick={() => setModalOpen(false)} aria-label="Fechar"><X size={20} /></button></div><form onSubmit={saveTransaction}><div className="type-toggle"><button type="button" className={form.type === 'expense' ? 'type-option expense selected' : 'type-option expense'} onClick={() => setForm(f => ({ ...f, type: 'expense', category_id: categories.find(c => c.type === 'expense')?.id ?? '' }))}><ArrowUpRight size={17} /> Gasto</button><button type="button" className={form.type === 'income' ? 'type-option income selected' : 'type-option income'} onClick={() => setForm(f => ({ ...f, type: 'income', category_id: categories.find(c => c.type === 'income')?.id ?? '' }))}><ArrowDownLeft size={17} /> Ganho</button></div><label>Descrição<input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex.: Compra no supermercado" maxLength={120} required autoFocus /></label><label>Valor (R$)<div className="amount-input"><span>R$</span><input inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: amountMask(e.target.value) }))} placeholder="0,00" required /></div></label><div className="modal-fields-row"><label>Categoria<select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}><option value="">Sem categoria</option>{categories.filter(c => c.type === form.type).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Data<input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>Cancelar</button><button className="primary-button" disabled={loading}>{loading ? 'Salvando…' : editing ? 'Salvar alterações' : 'Adicionar lançamento'} <Check size={17} /></button></div></form></section></div>}
    <Toaster theme={theme} richColors position="top-right" />
  </div>
}

function StatCard({ label, amount, icon, tone, helper }: { label: string; amount: number; icon: ReactNode; tone: 'green' | 'red' | 'purple'; helper: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}>{icon}</span></div><div className="stat-value">{brl(amount)}</div><span className="stat-helper">{helper}</span></div>
}
function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><strong>{title}</strong><p>{text}</p></div>
}
function TransactionTable({ items, categories, onEdit, onDelete }: { items: Transaction[]; categories: Category[]; onEdit: (t: Transaction) => void; onDelete: (id: string) => void }) {
  if (!items.length) return <EmptyState icon={<CreditCard size={22} />} title="Nenhum lançamento encontrado" text="Quando você registrar ganhos ou gastos, eles aparecerão aqui." />
  return <div className="table-scroll"><table className="transactions-table"><thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Valor</th><th aria-label="Ações" /></tr></thead><tbody>{items.map(t => { const cat = categories.find(c => c.id === t.category_id); return <tr key={t.id}><td><div className="transaction-description"><span className={t.type === 'income' ? 'transaction-symbol income' : 'transaction-symbol expense'}>{t.type === 'income' ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</span><span><strong>{t.description}</strong><small>{t.type === 'income' ? 'Ganho' : 'Gasto'}</small></span></div></td><td><span className="category-chip"><i style={{ background: cat?.color ?? 'var(--muted)' }} />{cat?.name ?? 'Sem categoria'}</span></td><td className="date-cell">{dateBR(t.date)}</td><td><strong className={t.type === 'income' ? 'amount-income' : 'amount-expense'}>{t.type === 'income' ? '+' : '−'} {brl(Number(t.amount))}</strong></td><td><div className="row-actions"><button className="subtle-icon" onClick={() => onEdit(t)} aria-label={`Editar ${t.description}`}><Pencil size={15} /></button><button className="subtle-icon danger-hover" onClick={() => onDelete(t.id)} aria-label={`Excluir ${t.description}`}><Trash2 size={15} /></button></div></td></tr> })}</tbody></table></div>
}
export default App
