import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Award, Shield, Download } from 'lucide-react';
import { Button } from '../components/ui/button';
import api from '../services/api';

export default function CertificatePage() {
  const { t } = useTranslation();
  const { simulationId } = useParams();
  const [cert, setCert] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadCertificate(); }, [simulationId]);

  const loadCertificate = async () => {
    try {
      const response = await api.get(`/certificates/${simulationId}`);
      setCert(response.data);
    } catch (error) {
      console.error('Failed to load certificate', error);
    } finally {
      setLoading(false);
    }
  };

  const printCertificate = () => {
    window.print();
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="text-primary font-mono animate-pulse">GENERATING...</div></div>;
  if (!cert) return <div className="text-center py-12 text-muted-foreground font-mono">Certificate not available. Minimum score: 70%</div>;

  const levelColors = { Platinum: 'from-blue-400 to-purple-500', Gold: 'from-yellow-400 to-amber-500', Silver: 'from-gray-300 to-gray-500', Bronze: 'from-amber-600 to-orange-700' };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex justify-end print:hidden">
        <Button onClick={printCertificate} variant="outline">
          <Download className="w-4 h-4 mr-2" /> PRINT / SAVE PDF
        </Button>
      </div>

      {/* Certificate */}
      <div className="bg-black border-2 border-primary/50 p-12 text-center relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0 grid-bg" />
        </div>

        {/* Decorative border */}
        <div className="absolute inset-4 border border-primary/20" />

        <div className="relative z-10 space-y-8">
          {/* Header */}
          <div>
            <Shield className="w-16 h-16 text-primary mx-auto mb-4" />
            <h1 className="text-4xl font-bold font-mono tracking-widest text-primary">PRETEXTA</h1>
            <p className="text-xs text-muted-foreground tracking-[0.3em] uppercase mt-2">Social Engineering Simulation Lab</p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-primary/30" />
            <span className="text-xs text-primary/50 font-mono">CERTIFICATE OF COMPLETION</span>
            <div className="flex-1 h-px bg-primary/30" />
          </div>

          {/* Recipient */}
          <div>
            <p className="text-sm text-muted-foreground mb-2">This certifies that</p>
            <h2 className="text-3xl font-bold text-foreground">{cert.recipient.name}</h2>
          </div>

          {/* Achievement */}
          <div>
            <p className="text-sm text-muted-foreground mb-3">has demonstrated proficiency in</p>
            <h3 className="text-xl font-bold text-primary uppercase tracking-wider">{cert.certification.title}</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">{cert.certification.description}</p>
          </div>

          {/* Level Badge */}
          <div className="inline-block">
            <div className={`px-8 py-3 bg-gradient-to-r ${levelColors[cert.certification.level] || levelColors.Silver} rounded-none`}>
              <div className="flex items-center gap-2">
                <Award className="w-6 h-6 text-black" />
                <span className="text-black font-bold font-mono text-lg uppercase tracking-wider">{cert.certification.level}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Score: {cert.simulation.score}%</p>
          </div>

          {/* Details */}
          <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground font-mono pt-4 border-t border-primary/20">
            <div>
              <p className="text-[10px] uppercase tracking-widest mb-1">Scenario</p>
              <p className="text-foreground">{cert.simulation.title}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest mb-1">Certificate ID</p>
              <p className="text-foreground">{cert.certificate_id}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest mb-1">Date Issued</p>
              <p className="text-foreground">{new Date(cert.issued_at).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
