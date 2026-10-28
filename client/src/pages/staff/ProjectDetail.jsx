import { useParams } from 'react-router-dom';
import ProjectView from '../../components/ProjectView.jsx';

export default function ProjectDetail() {
  const { id } = useParams();
  return <ProjectView id={id} />;
}
