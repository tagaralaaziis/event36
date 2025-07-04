'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Rnd } from 'react-rnd';
import toast from 'react-hot-toast';

interface Event {
  id: number;
  name: string;
  type: string;
  location: string;
  start_time: string;
  end_time: string;
}

interface Participant {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  token: string;
  registered_at: string;
}

interface TextElement {
  id: string;
  type: 'participant_name' | 'event_name' | 'certificate_number' | 'date' | 'token';
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  text: string;
}

interface Template {
  id: number;
  image: string;
  elements: TextElement[];
}

const FONT_FAMILIES = [
  'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana', 
  'Tahoma', 'Trebuchet MS', 'Impact', 'Comic Sans MS', 'Courier New'
];

const ELEMENT_TYPES = [
  { id: 'participant_name', label: 'Nama Peserta', defaultText: 'Nama Peserta' },
  { id: 'event_name', label: 'Nama Event', defaultText: 'Nama Event' },
  { id: 'certificate_number', label: 'Nomor Sertifikat', defaultText: 'Nomor Sertifikat' },
  { id: 'date', label: 'Tanggal', defaultText: 'Tanggal' },
  { id: 'token', label: 'Token', defaultText: 'Token' }
];

export default function GenerateMultiCertificatesPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;
  
  const [event, setEvent] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<number>(0);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [sendingProgress, setSendingProgress] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEventData();
    fetchParticipants();
    loadTemplates();
  }, [eventId]);

  const fetchEventData = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}`);
      if (response.ok) {
        const data = await response.json();
        setEvent(data);
      }
    } catch (error) {
      console.error('Error fetching event:', error);
      toast.error('Gagal memuat data event');
    }
  };

  const fetchParticipants = async () => {
    try {
      const response = await fetch(`/api/participants?eventId=${eventId}`);
      if (response.ok) {
        const data = await response.json();
        setParticipants(data);
      }
    } catch (error) {
      console.error('Error fetching participants:', error);
      toast.error('Gagal memuat data peserta');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/generate-certificates/multi-template`);
      if (response.ok) {
        const data = await response.json();
        if (data.templates && data.templates.length > 0) {
          setTemplates(data.templates);
        } else {
          // Initialize with one empty template
          setTemplates([{
            id: 1,
            image: '',
            elements: []
          }]);
        }
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      setTemplates([{
        id: 1,
        image: '',
        elements: []
      }]);
    }
  };

  const addTemplate = () => {
    if (templates.length >= 6) {
      toast.error('Maksimal 6 template');
      return;
    }
    
    const newTemplate: Template = {
      id: templates.length + 1,
      image: '',
      elements: []
    };
    
    setTemplates([...templates, newTemplate]);
    setActiveTemplate(templates.length);
  };

  const removeTemplate = (index: number) => {
    if (templates.length <= 1) {
      toast.error('Minimal harus ada 1 template');
      return;
    }
    
    const newTemplates = templates.filter((_, i) => i !== index);
    setTemplates(newTemplates);
    
    if (activeTemplate >= newTemplates.length) {
      setActiveTemplate(newTemplates.length - 1);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const newTemplates = [...templates];
      newTemplates[activeTemplate].image = e.target?.result as string;
      setTemplates(newTemplates);
    };
    reader.readAsDataURL(file);
  };

  const addTextElement = (type: string) => {
    const elementType = ELEMENT_TYPES.find(t => t.id === type);
    if (!elementType) return;

    const newElement: TextElement = {
      id: `${type}_${Date.now()}`,
      type: type as any,
      x: 100,
      y: 100,
      width: 200,
      height: 40,
      fontSize: 24,
      fontFamily: 'Helvetica',
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#000000',
      text: elementType.defaultText
    };

    const newTemplates = [...templates];
    newTemplates[activeTemplate].elements.push(newElement);
    setTemplates(newTemplates);
    setSelectedElement(newElement.id);
  };

  const updateElement = (elementId: string, updates: Partial<TextElement>) => {
    const newTemplates = [...templates];
    const elementIndex = newTemplates[activeTemplate].elements.findIndex(el => el.id === elementId);
    if (elementIndex !== -1) {
      newTemplates[activeTemplate].elements[elementIndex] = {
        ...newTemplates[activeTemplate].elements[elementIndex],
        ...updates
      };
      setTemplates(newTemplates);
    }
  };

  const removeElement = (elementId: string) => {
    const newTemplates = [...templates];
    newTemplates[activeTemplate].elements = newTemplates[activeTemplate].elements.filter(el => el.id !== elementId);
    setTemplates(newTemplates);
    setSelectedElement(null);
  };

  const saveTemplates = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/generate-certificates/multi-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates })
      });

      if (response.ok) {
        toast.success('Template berhasil disimpan');
      } else {
        throw new Error('Failed to save templates');
      }
    } catch (error) {
      console.error('Error saving templates:', error);
      toast.error('Gagal menyimpan template');
    }
  };

  const previewTemplate = async () => {
    if (!templates[activeTemplate].image) {
      toast.error('Upload gambar template terlebih dahulu');
      return;
    }

    try {
      const response = await fetch(`/api/events/${eventId}/generate-certificates/multi-template/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: templates[activeTemplate],
          templateIndex: activeTemplate + 1
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } else {
        throw new Error('Failed to generate preview');
      }
    } catch (error) {
      console.error('Error generating preview:', error);
      toast.error('Gagal membuat preview');
    }
  };

  const generateCertificates = async () => {
    if (templates.some(t => !t.image)) {
      toast.error('Semua template harus memiliki gambar');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      const response = await fetch(`/api/events/${eventId}/generate-certificates/multi-template/bulk-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates })
      });

      if (response.ok) {
        // Monitor progress
        const checkProgress = setInterval(async () => {
          try {
            const progressResponse = await fetch(`/api/events/${eventId}/generate-certificates/multi-template/stats`);
            if (progressResponse.ok) {
              const stats = await progressResponse.json();
              const progress = (stats.generated / stats.total) * 100;
              setGenerationProgress(progress);
              
              if (progress >= 100) {
                clearInterval(checkProgress);
                setIsGenerating(false);
                toast.success('Semua sertifikat berhasil digenerate');
                fetchParticipants(); // Refresh data
              }
            }
          } catch (error) {
            console.error('Error checking progress:', error);
          }
        }, 1000);

        // Cleanup after 5 minutes
        setTimeout(() => {
          clearInterval(checkProgress);
          setIsGenerating(false);
        }, 300000);

      } else {
        throw new Error('Failed to generate certificates');
      }
    } catch (error) {
      console.error('Error generating certificates:', error);
      toast.error('Gagal generate sertifikat');
      setIsGenerating(false);
    }
  };

  const sendAllCertificates = async () => {
    setIsSending(true);
    setSendingProgress(0);

    try {
      const response = await fetch(`/api/events/${eventId}/generate-certificates/multi-template/bulk-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates })
      });

      if (response.ok) {
        // Monitor sending progress
        const checkProgress = setInterval(async () => {
          try {
            const progressResponse = await fetch(`/api/events/${eventId}/generate-certificates/multi-template/stats`);
            if (progressResponse.ok) {
              const stats = await progressResponse.json();
              const progress = (stats.sent / stats.total) * 100;
              setSendingProgress(progress);
              
              if (progress >= 100) {
                clearInterval(checkProgress);
                setIsSending(false);
                toast.success('Semua sertifikat berhasil dikirim');
                fetchParticipants(); // Refresh data
              }
            }
          } catch (error) {
            console.error('Error checking sending progress:', error);
          }
        }, 1000);

        // Cleanup after 10 minutes
        setTimeout(() => {
          clearInterval(checkProgress);
          setIsSending(false);
        }, 600000);

      } else {
        throw new Error('Failed to send certificates');
      }
    } catch (error) {
      console.error('Error sending certificates:', error);
      toast.error('Gagal mengirim sertifikat');
      setIsSending(false);
    }
  };

  const selectedElementData = selectedElement 
    ? templates[activeTemplate]?.elements.find(el => el.id === selectedElement)
    : null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Memuat data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.back()}
                className="flex items-center text-blue-600 hover:text-blue-700 mb-4"
              >
                ← Back to Event
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Generate Multi-Template Certificates</h1>
              <p className="text-gray-600">Design up to 6 different certificate templates for participants.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={saveTemplates}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                💾 Save
              </button>
              <button
                onClick={previewTemplate}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                👁️ Preview
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Template Selection & Controls */}
          <div className="lg:col-span-1 space-y-6">
            {/* Template Tabs */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Templates ({templates.length}/6)</h3>
                <button
                  onClick={addTemplate}
                  disabled={templates.length >= 6}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  + Add
                </button>
              </div>
              
              <div className="space-y-2">
                {templates.map((template, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTemplate(index)}
                      className={`flex-1 p-2 rounded text-left ${
                        activeTemplate === index 
                          ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                          : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      Template {index + 1}
                    </button>
                    {templates.length > 1 && (
                      <button
                        onClick={() => removeTemplate(index)}
                        className="text-red-600 hover:text-red-700 p-1"
                        title="Hapus Template"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Upload Template */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="font-semibold mb-3">Upload Template {activeTemplate + 1}</h3>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full p-2 border border-gray-300 rounded"
              />
            </div>

            {/* Add Elements */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="font-semibold mb-3">Add Elements</h3>
              <div className="space-y-2">
                {ELEMENT_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => addTextElement(type.id)}
                    className="w-full p-2 text-left bg-gray-50 hover:bg-gray-100 rounded border"
                  >
                    + {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Element Properties */}
            {selectedElementData && (
              <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Element Properties</h3>
                  <button
                    onClick={() => removeElement(selectedElement!)}
                    className="text-red-600 hover:text-red-700"
                  >
                    🗑️
                  </button>
                </div>
                
                <div className="space-y-3">
                  {/* Font Family */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Font Family</label>
                    <select
                      value={selectedElementData.fontFamily}
                      onChange={(e) => updateElement(selectedElement!, { fontFamily: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded"
                    >
                      {FONT_FAMILIES.map(font => (
                        <option key={font} value={font}>{font}</option>
                      ))}
                    </select>
                  </div>

                  {/* Font Size */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Font Size</label>
                    <input
                      type="number"
                      value={selectedElementData.fontSize}
                      onChange={(e) => updateElement(selectedElement!, { fontSize: parseInt(e.target.value) })}
                      className="w-full p-2 border border-gray-300 rounded"
                      min="8"
                      max="72"
                    />
                  </div>

                  {/* Font Style */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Font Style</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateElement(selectedElement!, { 
                          fontWeight: selectedElementData.fontWeight === 'bold' ? 'normal' : 'bold' 
                        })}
                        className={`px-3 py-1 rounded border ${
                          selectedElementData.fontWeight === 'bold' 
                            ? 'bg-blue-100 border-blue-300 text-blue-700' 
                            : 'bg-gray-50 border-gray-300'
                        }`}
                      >
                        <strong>B</strong>
                      </button>
                      <button
                        onClick={() => updateElement(selectedElement!, { 
                          fontStyle: selectedElementData.fontStyle === 'italic' ? 'normal' : 'italic' 
                        })}
                        className={`px-3 py-1 rounded border ${
                          selectedElementData.fontStyle === 'italic' 
                            ? 'bg-blue-100 border-blue-300 text-blue-700' 
                            : 'bg-gray-50 border-gray-300'
                        }`}
                      >
                        <em>I</em>
                      </button>
                    </div>
                  </div>

                  {/* Color */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Color</label>
                    <input
                      type="color"
                      value={selectedElementData.color}
                      onChange={(e) => updateElement(selectedElement!, { color: e.target.value })}
                      className="w-full h-10 border border-gray-300 rounded"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Main Canvas Area */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold mb-4">Template {activeTemplate + 1} Design</h3>
              
              <div 
                ref={canvasRef}
                className="relative border-2 border-dashed border-gray-300 rounded-lg overflow-hidden"
                style={{ 
                  width: '800px', 
                  height: '600px',
                  backgroundImage: templates[activeTemplate]?.image ? `url(${templates[activeTemplate].image})` : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: templates[activeTemplate]?.image ? 'transparent' : '#f9fafb'
                }}
              >
                {!templates[activeTemplate]?.image && (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                    Upload template image to start designing
                  </div>
                )}

                {templates[activeTemplate]?.elements.map((element) => (
                  <Rnd
                    key={element.id}
                    size={{ width: element.width, height: element.height }}
                    position={{ x: element.x, y: element.y }}
                    onDragStop={(e, d) => updateElement(element.id, { x: d.x, y: d.y })}
                    onResizeStop={(e, direction, ref, delta, position) => {
                      updateElement(element.id, {
                        width: parseInt(ref.style.width),
                        height: parseInt(ref.style.height),
                        x: position.x,
                        y: position.y
                      });
                    }}
                    onClick={() => setSelectedElement(element.id)}
                    className={`cursor-move ${selectedElement === element.id ? 'ring-2 ring-blue-500' : ''}`}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        fontSize: `${element.fontSize}px`,
                        fontFamily: element.fontFamily,
                        fontWeight: element.fontWeight,
                        fontStyle: element.fontStyle,
                        color: element.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        backgroundColor: selectedElement === element.id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                        border: selectedElement === element.id ? '1px solid #3b82f6' : '1px dashed rgba(0,0,0,0.3)',
                        borderRadius: '4px'
                      }}
                    >
                      {element.text}
                    </div>
                  </Rnd>
                ))}
              </div>

              {/* Bulk Actions - Moved below canvas */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="font-semibold mb-4">Bulk Actions</h4>
                <div className="flex flex-wrap gap-4">
                  <button
                    onClick={generateCertificates}
                    disabled={isGenerating || templates.some(t => !t.image)}
                    className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Generating... {Math.round(generationProgress)}%
                      </>
                    ) : (
                      <>
                        📄 Generate All Certificates
                      </>
                    )}
                  </button>

                  <button
                    onClick={sendAllCertificates}
                    disabled={isSending}
                    className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Sending... {Math.round(sendingProgress)}%
                      </>
                    ) : (
                      <>
                        📧 Send All Certificates
                      </>
                    )}
                  </button>

                  <div className="text-sm text-gray-600 flex items-center">
                    Total Participants: {participants.length}
                  </div>
                </div>

                {/* Progress Bars */}
                {isGenerating && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Generating Certificates</span>
                      <span>{Math.round(generationProgress)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${generationProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {isSending && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Sending Certificates</span>
                      <span>{Math.round(sendingProgress)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${sendingProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}