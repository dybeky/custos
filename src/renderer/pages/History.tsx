import { useNavigate } from 'react-router-dom'
import { HistoryView } from '../components/history/HistoryView'

/** Saved checks (classic shell); opening one shows it on the Results page. */
export function History() {
  const navigate = useNavigate()
  return <HistoryView onOpened={() => navigate('/results')} />
}
