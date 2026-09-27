import { useNavigate } from 'react-router-dom'
import { HistoryView } from '../../components/history/HistoryView'

/** Saved checks (modern shell); opening one shows it in the Check workspace. */
export function HistoryPage() {
  const navigate = useNavigate()
  return <HistoryView onOpened={() => navigate('/')} />
}
