import { useParams } from 'react-router-dom';
import AppointmentView from '../../components/AppointmentView.jsx';

export default function AppointmentDetail() {
  const { id } = useParams();
  return <AppointmentView id={id} />;
}
